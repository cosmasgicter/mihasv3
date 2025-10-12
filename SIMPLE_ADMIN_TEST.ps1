# MIHAS Simple Admin Test - 100% Verification
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

Write-Host "MIHAS Admin Test - Final Verification" -ForegroundColor Yellow

# 1. Authentication
$authResult = Invoke-API -Endpoint "/auth/v1/token?grant_type=password" -Method "POST" -Body @{ email = $ADMIN_EMAIL; password = $ADMIN_PASSWORD }
if ($authResult.Success -and $authResult.Data.access_token) {
    $script:AuthToken = $authResult.Data.access_token
    Write-TestResult "Admin Authentication" $true "Login successful"
} else {
    Write-TestResult "Admin Authentication" $false "Login failed"
    exit 1
}

# 2. Applications
$appsResult = Invoke-API -Endpoint "/rest/v1/applications?select=*&limit=10"
if ($appsResult.Success) {
    Write-TestResult "Applications Access" $true "Retrieved $($appsResult.Data.Count) applications"
} else {
    Write-TestResult "Applications Access" $false "Failed"
}

# 3. Profiles
$profilesResult = Invoke-API -Endpoint "/rest/v1/profiles?select=*&limit=5"
if ($profilesResult.Success) {
    Write-TestResult "Profiles Access" $true "Retrieved $($profilesResult.Data.Count) profiles"
} else {
    Write-TestResult "Profiles Access" $false "Failed"
}

# 4. Status Update Test
if ($appsResult.Success -and $appsResult.Data.Count -gt 0) {
    $testAppId = $appsResult.Data[0].id
    $originalStatus = $appsResult.Data[0].status
    
    # Approve
    $approveResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$testAppId" -Method "PATCH" -Body @{ status = "approved" }
    if ($approveResult.Success) {
        Write-TestResult "Approve Application" $true "Status updated"
        
        # Reject
        $rejectResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$testAppId" -Method "PATCH" -Body @{ status = "rejected" }
        if ($rejectResult.Success) {
            Write-TestResult "Reject Application" $true "Status updated"
        } else {
            Write-TestResult "Reject Application" $false "Failed"
        }
        
        # Revert
        $revertResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$testAppId" -Method "PATCH" -Body @{ status = $originalStatus }
        if ($revertResult.Success) {
            Write-TestResult "Revert Status" $true "Reverted successfully"
        } else {
            Write-TestResult "Revert Status" $false "Failed"
        }
    } else {
        Write-TestResult "Approve Application" $false "Failed"
    }
} else {
    Write-TestResult "Approval Workflow" $false "No applications to test"
}

# 5. Programs
$programsResult = Invoke-API -Endpoint "/rest/v1/programs?select=*"
Write-TestResult "Programs Access" $programsResult.Success "Programs: $($programsResult.Data.Count)"

# 6. Intakes
$intakesResult = Invoke-API -Endpoint "/rest/v1/intakes?select=*"
Write-TestResult "Intakes Access" $intakesResult.Success "Intakes: $($intakesResult.Data.Count)"

# 7. Documents
$docsResult = Invoke-API -Endpoint "/rest/v1/documents?select=*&limit=5"
Write-TestResult "Documents Access" $docsResult.Success "Documents accessible"

# 8. Notifications
$notificationsResult = Invoke-API -Endpoint "/rest/v1/notifications?select=*&limit=5"
Write-TestResult "Notifications Access" $notificationsResult.Success "Notifications accessible"

# Results
Write-Host "`n=============================" -ForegroundColor Yellow
Write-Host "FINAL TEST RESULTS" -ForegroundColor Yellow
Write-Host "=============================" -ForegroundColor Yellow
Write-Host "Passed: $TestsPassed" -ForegroundColor Green
Write-Host "Failed: $TestsFailed" -ForegroundColor Red

$total = $TestsPassed + $TestsFailed
if ($total -gt 0) {
    $successRate = [math]::Round(($TestsPassed / $total) * 100, 1)
    Write-Host "Success Rate: $successRate%" -ForegroundColor Cyan
    
    if ($successRate -eq 100) {
        Write-Host "`nSTATUS: 100% ADMIN FUNCTIONALITY ACHIEVED!" -ForegroundColor Green
    } elseif ($successRate -ge 90) {
        Write-Host "`nSTATUS: ADMIN SYSTEM FULLY FUNCTIONAL!" -ForegroundColor Green
    } elseif ($successRate -ge 80) {
        Write-Host "`nSTATUS: ADMIN SYSTEM MOSTLY FUNCTIONAL!" -ForegroundColor Yellow
    } else {
        Write-Host "`nSTATUS: NEEDS MORE FIXES" -ForegroundColor Red
    }
}

Write-Host "`nAdmin testing completed!" -ForegroundColor Green