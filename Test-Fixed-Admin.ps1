# MIHAS Admin Test - After View Fix
$SUPABASE_URL = "https://mylgegkqoddcrxtwcclb.supabase.co"
$SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw"
$ADMIN_EMAIL = "alexisstar8@gmail.com"
$ADMIN_PASSWORD = "Skyl3rL0m1s"

$AuthToken = $null
$TestsPassed = 0
$TestsFailed = 0

function Write-TestResult {
    param([string]$TestName, [bool]$Passed, [string]$Details = "")
    $status = if ($Passed) { "PASS" } else { "FAIL" }
    Write-Host "[$status] $TestName" -ForegroundColor $(if ($Passed) { "Green" } else { "Red" })
    if ($Details) { Write-Host "   $Details" -ForegroundColor Gray }
    if ($Passed) { $script:TestsPassed++ } else { $script:TestsFailed++ }
}

function Invoke-API {
    param([string]$Endpoint, [string]$Method = "GET", [hashtable]$Body = $null)
    $uri = "$SUPABASE_URL$Endpoint"
    $headers = @{ "Content-Type" = "application/json"; "apikey" = $SUPABASE_KEY }
    if ($script:AuthToken) { $headers["Authorization"] = "Bearer $script:AuthToken" }
    
    try {
        $params = @{ Uri = $uri; Method = $Method; Headers = $headers }
        if ($Body) { $params.Body = ($Body | ConvertTo-Json -Depth 10) }
        $response = Invoke-RestMethod @params
        return @{ Success = $true; Data = $response; Error = $null }
    }
    catch {
        return @{ Success = $false; Data = $null; Error = $_.Exception.Message }
    }
}

Write-Host "MIHAS Admin Test - After View Fix" -ForegroundColor Yellow

# 1. Authentication
$authResult = Invoke-API -Endpoint "/auth/v1/token?grant_type=password" -Method "POST" -Body @{ email = $ADMIN_EMAIL; password = $ADMIN_PASSWORD }
if ($authResult.Success -and $authResult.Data.access_token) {
    $script:AuthToken = $authResult.Data.access_token
    Write-TestResult "Admin Authentication" $true "Login successful"
} else {
    Write-TestResult "Admin Authentication" $false "Login failed"
    exit 1
}

# 2. Applications Access
$appsResult = Invoke-API -Endpoint "/rest/v1/applications?select=*&limit=5"
if ($appsResult.Success) {
    Write-TestResult "Applications Access" $true "Retrieved $($appsResult.Data.Count) applications"
} else {
    Write-TestResult "Applications Access" $false "Failed: $($appsResult.Error)"
}

# 3. Profiles Access (Fixed)
$profilesResult = Invoke-API -Endpoint "/rest/v1/profiles?select=*&limit=5"
if ($profilesResult.Success) {
    Write-TestResult "Profiles Access" $true "Retrieved $($profilesResult.Data.Count) profiles"
} else {
    Write-TestResult "Profiles Access" $false "Failed: $($profilesResult.Error)"
}

# 4. Status Update Test (Simple)
if ($appsResult.Success -and $appsResult.Data.Count -gt 0) {
    $testAppId = $appsResult.Data[0].id
    $originalStatus = $appsResult.Data[0].status
    
    # Try to update status
    $updateResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$testAppId" -Method "PATCH" -Body @{ status = "under_review" }
    if ($updateResult.Success) {
        Write-TestResult "Status Update" $true "Status updated successfully"
        
        # Revert status
        Invoke-API -Endpoint "/rest/v1/applications?id=eq.$testAppId" -Method "PATCH" -Body @{ status = $originalStatus } | Out-Null
        Write-TestResult "Status Revert" $true "Status reverted to original"
    } else {
        Write-TestResult "Status Update" $false "Update failed: $($updateResult.Error)"
    }
} else {
    Write-TestResult "Status Update" $false "No applications to test"
}

# 5. Programs and Intakes
$programsResult = Invoke-API -Endpoint "/rest/v1/programs?select=*"
Write-TestResult "Programs Access" $programsResult.Success "Programs: $($programsResult.Data.Count)"

$intakesResult = Invoke-API -Endpoint "/rest/v1/intakes?select=*"
Write-TestResult "Intakes Access" $intakesResult.Success "Intakes: $($intakesResult.Data.Count)"

# Results
Write-Host "`n=============================" -ForegroundColor Yellow
Write-Host "TEST RESULTS" -ForegroundColor Yellow
Write-Host "=============================" -ForegroundColor Yellow
Write-Host "Passed: $TestsPassed" -ForegroundColor Green
Write-Host "Failed: $TestsFailed" -ForegroundColor Red

$total = $TestsPassed + $TestsFailed
if ($total -gt 0) {
    $successRate = [math]::Round(($TestsPassed / $total) * 100, 1)
    Write-Host "Success Rate: $successRate%" -ForegroundColor Cyan
    
    if ($successRate -ge 85) {
        Write-Host "`nSTATUS: ADMIN SYSTEM FUNCTIONAL!" -ForegroundColor Green
    } else {
        Write-Host "`nSTATUS: NEEDS MORE FIXES" -ForegroundColor Yellow
    }
}

Write-Host "`nTesting completed!" -ForegroundColor Green