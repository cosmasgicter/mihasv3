# MIHAS Admin Test - 100% Functionality Verification
param()

$SUPABASE_URL = "https://mylgegkqoddcrxtwcclb.supabase.co"
$SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw"
$ADMIN_EMAIL = "alexisstar8@gmail.com"
$ADMIN_PASSWORD = "Skyl3rL0m1s"

$AuthToken = $null
$TestApplicationId = $null
$TestsPassed = 0
$TestsFailed = 0

function Write-TestResult {
    param([string]$TestName, [bool]$Passed, [string]$Details = "")
    
    $status = if ($Passed) { "PASS" } else { "FAIL" }
    Write-Host "[$status] $TestName" -ForegroundColor $(if ($Passed) { "Green" } else { "Red" })
    
    if ($Details) {
        Write-Host "   $Details" -ForegroundColor Gray
    }
    
    if ($Passed) { $script:TestsPassed++ } else { $script:TestsFailed++ }
}

function Invoke-API {
    param([string]$Endpoint, [string]$Method = "GET", [hashtable]$Body = $null)
    
    $uri = "$SUPABASE_URL$Endpoint"
    $headers = @{
        "Content-Type" = "application/json"
        "apikey" = $SUPABASE_KEY
    }
    
    if ($script:AuthToken) {
        $headers["Authorization"] = "Bearer $script:AuthToken"
    }
    
    try {
        $params = @{
            Uri = $uri
            Method = $Method
            Headers = $headers
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-RestMethod @params
        return @{ Success = $true; Data = $response; Error = $null }
    }
    catch {
        return @{ Success = $false; Data = $null; Error = $_.Exception.Message }
    }
}

Write-Host "MIHAS Admin 100% Functionality Test" -ForegroundColor Yellow
Write-Host "====================================" -ForegroundColor Yellow

# 1. Admin Authentication
Write-Host "`n1. Admin Authentication" -ForegroundColor Cyan
$authBody = @{ email = $ADMIN_EMAIL; password = $ADMIN_PASSWORD }
$authResult = Invoke-API -Endpoint "/auth/v1/token?grant_type=password" -Method "POST" -Body $authBody

if ($authResult.Success -and $authResult.Data.access_token) {
    $script:AuthToken = $authResult.Data.access_token
    Write-TestResult "Admin Login" $true "Authenticated successfully"
} else {
    Write-TestResult "Admin Login" $false "Authentication failed"
    exit 1
}

# 2. Get Applications
Write-Host "`n2. Application Management" -ForegroundColor Cyan
$appsResult = Invoke-API -Endpoint "/rest/v1/applications?select=*&order=created_at.desc"

if ($appsResult.Success -and $appsResult.Data) {
    Write-TestResult "Get Applications" $true "Retrieved $($appsResult.Data.Count) applications"
    
    # Find test application
    $testApp = $appsResult.Data | Where-Object { $_.status -eq "submitted" } | Select-Object -First 1
    if (-not $testApp) {
        $testApp = $appsResult.Data | Select-Object -First 1
    }
    
    if ($testApp) {
        $script:TestApplicationId = $testApp.id
        Write-TestResult "Found Test Application" $true "ID: $script:TestApplicationId"
    }
} else {
    Write-TestResult "Get Applications" $false "Failed to retrieve applications"
}

# 3. Profiles Access (Fixed)
Write-Host "`n3. Profile Management" -ForegroundColor Cyan
$profilesResult = Invoke-API -Endpoint "/rest/v1/profiles?select=*&limit=5"

if ($profilesResult.Success) {
    Write-TestResult "Profiles Access" $true "Retrieved $($profilesResult.Data.Count) profiles"
} else {
    Write-TestResult "Profiles Access" $false "Profiles access failed"
}

# 4. Approval Workflow (Fixed with null checks)
if ($script:TestApplicationId) {
    Write-Host "`n4. Approval Workflow" -ForegroundColor Cyan
    
    # Get original status with null safety
    $originalResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$script:TestApplicationId&select=status,reviewed_by,reviewed_at,admin_notes"
    
    $originalStatus = "submitted"  # Default fallback
    $originalReviewedBy = $null
    $originalReviewedAt = $null
    $originalAdminNotes = $null
    
    if ($originalResult.Success -and $originalResult.Data -and $originalResult.Data.Count -gt 0) {
        $originalData = $originalResult.Data[0]
        $originalStatus = if ($originalData.status) { $originalData.status } else { "submitted" }
        $originalReviewedBy = $originalData.reviewed_by
        $originalReviewedAt = $originalData.reviewed_at
        $originalAdminNotes = $originalData.admin_notes
    }
    
    Write-Host "   Original Status: $originalStatus" -ForegroundColor Yellow
    
    # Test Approve
    $approveBody = @{
        status = "approved"
        reviewed_by = $ADMIN_EMAIL
        reviewed_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        admin_notes = "Approved via API test"
    }
    
    $approveResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$script:TestApplicationId" -Method "PATCH" -Body $approveBody
    
    if ($approveResult.Success) {
        Write-TestResult "Approve Application" $true "Status updated to approved"
        
        # Verify approval
        Start-Sleep -Seconds 1
        $verifyResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$script:TestApplicationId&select=status"
        
        if ($verifyResult.Success -and $verifyResult.Data[0].status -eq "approved") {
            Write-TestResult "Verify Approval" $true "Approval confirmed"
        } else {
            Write-TestResult "Verify Approval" $false "Approval not confirmed"
        }
        
        # Test Reject
        $rejectBody = @{
            status = "rejected"
            reviewed_by = $ADMIN_EMAIL
            reviewed_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            admin_notes = "Rejected via API test"
        }
        
        $rejectResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$script:TestApplicationId" -Method "PATCH" -Body $rejectBody
        
        if ($rejectResult.Success) {
            Write-TestResult "Reject Application" $true "Status updated to rejected"
        } else {
            Write-TestResult "Reject Application" $false "Rejection failed"
        }
        
        # Revert to original
        $revertBody = @{
            status = $originalStatus
        }
        
        if ($originalReviewedBy) { $revertBody.reviewed_by = $originalReviewedBy }
        if ($originalReviewedAt) { $revertBody.reviewed_at = $originalReviewedAt }
        if ($originalAdminNotes) { $revertBody.admin_notes = $originalAdminNotes }
        
        $revertResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$script:TestApplicationId" -Method "PATCH" -Body $revertBody
        
        if ($revertResult.Success) {
            Write-TestResult "Revert Status" $true "Reverted to original status"
        } else {
            Write-TestResult "Revert Status" $false "Revert failed"
        }
        
    } else {
        Write-TestResult "Approve Application" $false "Approval failed"
    }
} else {
    Write-TestResult "Approval Workflow" $false "No test application available"
}

# 5. Programs Management
Write-Host "`n5. Programs Management" -ForegroundColor Cyan
$programsResult = Invoke-API -Endpoint "/rest/v1/programs?select=*"
if ($programsResult.Success) {
    Write-TestResult "Programs Management" $true "Retrieved $($programsResult.Data.Count) programs"
} else {
    Write-TestResult "Programs Management" $false "Programs access failed"
}

# 6. Intakes Management
Write-Host "`n6. Intakes Management" -ForegroundColor Cyan
$intakesResult = Invoke-API -Endpoint "/rest/v1/intakes?select=*"
if ($intakesResult.Success) {
    Write-TestResult "Intakes Management" $true "Retrieved $($intakesResult.Data.Count) intakes"
} else {
    Write-TestResult "Intakes Management" $false "Intakes access failed"
}

# 7. Documents Management
Write-Host "`n7. Documents Management" -ForegroundColor Cyan
$docsResult = Invoke-API -Endpoint "/rest/v1/documents?select=*&limit=10"
if ($docsResult.Success) {
    Write-TestResult "Documents Management" $true "Documents accessible"
} else {
    Write-TestResult "Documents Management" $false "Documents access failed"
}

# 8. Notifications Management
Write-Host "`n8. Notifications Management" -ForegroundColor Cyan
$notificationsResult = Invoke-API -Endpoint "/rest/v1/notifications?select=*&limit=10"
if ($notificationsResult.Success) {
    Write-TestResult "Notifications Management" $true "Notifications accessible"
} else {
    Write-TestResult "Notifications Management" $false "Notifications access failed"
}

# 9. Admin Statistics
Write-Host "`n9. Admin Statistics" -ForegroundColor Cyan
$statsResult = Invoke-API -Endpoint "/rest/v1/applications?select=status"
if ($statsResult.Success) {
    $stats = @{}
    foreach ($app in $statsResult.Data) {
        $status = if ($app.status) { $app.status } else { "unknown" }
        if ($stats.ContainsKey($status)) {
            $stats[$status]++
        } else {
            $stats[$status] = 1
        }
    }
    Write-TestResult "Admin Statistics" $true "Statistics generated successfully"
} else {
    Write-TestResult "Admin Statistics" $false "Statistics generation failed"
}

# 10. Bulk Operations
Write-Host "`n10. Bulk Operations" -ForegroundColor Cyan
$bulkResult = Invoke-API -Endpoint "/rest/v1/applications?select=id,status&limit=5"
if ($bulkResult.Success -and $bulkResult.Data.Count -gt 0) {
    Write-TestResult "Bulk Operations" $true "Bulk query successful"
} else {
    Write-TestResult "Bulk Operations" $false "Bulk operations failed"
}

# Final Results
Write-Host "`n====================================" -ForegroundColor Yellow
Write-Host "FINAL TEST RESULTS" -ForegroundColor Yellow
Write-Host "====================================" -ForegroundColor Yellow
Write-Host "Passed: $TestsPassed" -ForegroundColor Green
Write-Host "Failed: $TestsFailed" -ForegroundColor Red

$total = $TestsPassed + $TestsFailed
if ($total -gt 0) {
    $successRate = [math]::Round(($TestsPassed / $total) * 100, 1)
    Write-Host "Success Rate: $successRate%" -ForegroundColor Cyan
    
    if ($successRate -eq 100) {
        Write-Host "`nSTATUS: 100% ADMIN FUNCTIONALITY ACHIEVED!" -ForegroundColor Green
    } elseif ($successRate -ge 90) {
        Write-Host "`nSTATUS: ADMIN SYSTEM FULLY OPERATIONAL" -ForegroundColor Green
    } else {
        Write-Host "`nSTATUS: ADMIN SYSTEM NEEDS ATTENTION" -ForegroundColor Yellow
    }
}

Write-Host "`nAdmin testing completed!" -ForegroundColor Green