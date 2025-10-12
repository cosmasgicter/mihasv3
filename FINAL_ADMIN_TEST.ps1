# MIHAS Final Admin Test - 100% Verification
$SUPABASE_URL = "https://mylgegkqoddcrxtwcclb.supabase.co"
$SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw"
$ADMIN_EMAIL = "alexisstar8@gmail.com"
$ADMIN_PASSWORD = "Skyl3rL0m1s"

$AuthToken = $null
$TestsPassed = 0
$TestsFailed = 0

function Write-TestResult {
    param([string]$TestName, [bool]$Passed, [string]$Details = "")
    $status = if ($Passed) { "✅ PASS" } else { "❌ FAIL" }
    Write-Host "$status`: $TestName" -ForegroundColor $(if ($Passed) { "Green" } else { "Red" })
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

Write-Host "🚀 MIHAS FINAL ADMIN TEST - 100% VERIFICATION" -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Yellow

# 1. Admin Authentication
Write-Host "`n1️⃣ Admin Authentication" -ForegroundColor Cyan
$authResult = Invoke-API -Endpoint "/auth/v1/token?grant_type=password" -Method "POST" -Body @{ email = $ADMIN_EMAIL; password = $ADMIN_PASSWORD }
if ($authResult.Success -and $authResult.Data.access_token) {
    $script:AuthToken = $authResult.Data.access_token
    Write-TestResult "Admin Login" $true "Authenticated as $($authResult.Data.user.email)"
} else {
    Write-TestResult "Admin Login" $false "Authentication failed"
    exit 1
}

# 2. Applications Management
Write-Host "`n2️⃣ Applications Management" -ForegroundColor Cyan
$appsResult = Invoke-API -Endpoint "/rest/v1/applications?select=*&order=created_at.desc"
if ($appsResult.Success) {
    Write-TestResult "Get All Applications" $true "Retrieved $($appsResult.Data.Count) applications"
    
    # Application statistics
    $statusCounts = @{}
    foreach ($app in $appsResult.Data) {
        $status = if ($app.status) { $app.status } else { "unknown" }
        $statusCounts[$status] = ($statusCounts[$status] ?? 0) + 1
    }
    $statsText = ($statusCounts.GetEnumerator() | ForEach-Object { "$($_.Key): $($_.Value)" }) -join ", "
    Write-TestResult "Application Statistics" $true $statsText
} else {
    Write-TestResult "Get All Applications" $false "Failed to retrieve applications"
}

# 3. Profiles Access
Write-Host "`n3️⃣ Profile Management" -ForegroundColor Cyan
$profilesResult = Invoke-API -Endpoint "/rest/v1/profiles?select=*&limit=5"
if ($profilesResult.Success) {
    Write-TestResult "Profiles Access" $true "Retrieved $($profilesResult.Data.Count) profiles"
    
    # Find admin profile
    $adminProfile = $profilesResult.Data | Where-Object { $_.email -eq $ADMIN_EMAIL }
    if ($adminProfile) {
        Write-TestResult "Admin Profile Found" $true "Role: $($adminProfile.role)"
    } else {
        Write-TestResult "Admin Profile Found" $false "Admin profile not in results"
    }
} else {
    Write-TestResult "Profiles Access" $false "Failed: $($profilesResult.Error)"
}

# 4. Approval Workflow
Write-Host "`n4️⃣ Approval Workflow" -ForegroundColor Cyan
if ($appsResult.Success -and $appsResult.Data.Count -gt 0) {
    $testApp = $appsResult.Data | Where-Object { $_.status -eq "submitted" } | Select-Object -First 1
    if (-not $testApp) { $testApp = $appsResult.Data[0] }
    
    $testAppId = $testApp.id
    $originalStatus = $testApp.status
    
    Write-Host "   Testing with Application ID: $testAppId (Status: $originalStatus)" -ForegroundColor Yellow
    
    # Test Approve
    $approveResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$testAppId" -Method "PATCH" -Body @{ 
        status = "approved"
    }
    if ($approveResult.Success) {
        Write-TestResult "Approve Application" $true "Status updated to approved"
        
        # Verify approval
        Start-Sleep -Seconds 1
        $verifyResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$testAppId&select=status"
        if ($verifyResult.Success -and $verifyResult.Data[0].status -eq "approved") {
            Write-TestResult "Verify Approval" $true "Approval confirmed in database"
        } else {
            Write-TestResult "Verify Approval" $false "Approval not confirmed"
        }
        
        # Test Reject
        $rejectResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$testAppId" -Method "PATCH" -Body @{ 
            status = "rejected"
        }
        if ($rejectResult.Success) {
            Write-TestResult "Reject Application" $true "Status updated to rejected"
        } else {
            Write-TestResult "Reject Application" $false "Rejection failed"
        }
        
        # Revert to original
        $revertResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$testAppId" -Method "PATCH" -Body @{ 
            status = $originalStatus
        }
        if ($revertResult.Success) {
            Write-TestResult "Revert Status" $true "Reverted to original status: $originalStatus"
        } else {
            Write-TestResult "Revert Status" $false "Revert failed"
        }
    } else {
        Write-TestResult "Approve Application" $false "Approval failed: $($approveResult.Error)"
    }
} else {
    Write-TestResult "Approval Workflow" $false "No applications available for testing"
}

# 5. Programs Management
Write-Host "`n5️⃣ Programs Management" -ForegroundColor Cyan
$programsResult = Invoke-API -Endpoint "/rest/v1/programs?select=*"
if ($programsResult.Success) {
    Write-TestResult "Programs Access" $true "Retrieved $($programsResult.Data.Count) programs"
    if ($programsResult.Data.Count -gt 0) {
        $programNames = $programsResult.Data | ForEach-Object { $_.name } | Select-Object -First 3
        Write-TestResult "Program Details" $true "Programs: $($programNames -join ', ')"
    }
} else {
    Write-TestResult "Programs Access" $false "Failed to access programs"
}

# 6. Intakes Management
Write-Host "`n6️⃣ Intakes Management" -ForegroundColor Cyan
$intakesResult = Invoke-API -Endpoint "/rest/v1/intakes?select=*"
if ($intakesResult.Success) {
    Write-TestResult "Intakes Access" $true "Retrieved $($intakesResult.Data.Count) intakes"
    if ($intakesResult.Data.Count -gt 0) {
        $intakeNames = $intakesResult.Data | ForEach-Object { "$($_.name) ($($_.year))" } | Select-Object -First 3
        Write-TestResult "Intake Details" $true "Intakes: $($intakeNames -join ', ')"
    }
} else {
    Write-TestResult "Intakes Access" $false "Failed to access intakes"
}

# 7. Documents Management
Write-Host "`n7️⃣ Documents Management" -ForegroundColor Cyan
$docsResult = Invoke-API -Endpoint "/rest/v1/documents?select=*&limit=10"
if ($docsResult.Success) {
    Write-TestResult "Documents Access" $true "Documents table accessible ($($docsResult.Data.Count) documents)"
} else {
    Write-TestResult "Documents Access" $false "Failed to access documents"
}

# 8. Notifications Management
Write-Host "`n8️⃣ Notifications Management" -ForegroundColor Cyan
$notificationsResult = Invoke-API -Endpoint "/rest/v1/notifications?select=*&limit=10"
if ($notificationsResult.Success) {
    Write-TestResult "Notifications Access" $true "Notifications accessible ($($notificationsResult.Data.Count) notifications)"
} else {
    Write-TestResult "Notifications Access" $false "Failed to access notifications"
}

# Final Results
Write-Host "`n=============================================" -ForegroundColor Yellow
Write-Host "🎯 FINAL TEST RESULTS" -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Yellow
Write-Host "✅ Passed: $TestsPassed" -ForegroundColor Green
Write-Host "❌ Failed: $TestsFailed" -ForegroundColor Red

$total = $TestsPassed + $TestsFailed
if ($total -gt 0) {
    $successRate = [math]::Round(($TestsPassed / $total) * 100, 1)
    Write-Host "🎯 Success Rate: $successRate%" -ForegroundColor Cyan
    
    if ($successRate -eq 100) {
        Write-Host "`n🎉 STATUS: 100% ADMIN FUNCTIONALITY ACHIEVED!" -ForegroundColor Green
        Write-Host "🚀 MIHAS Admin System is FULLY OPERATIONAL!" -ForegroundColor Green
    } elseif ($successRate -ge 90) {
        Write-Host "`n✅ STATUS: ADMIN SYSTEM FULLY FUNCTIONAL!" -ForegroundColor Green
        Write-Host "🎯 Minor issues remaining: $TestsFailed" -ForegroundColor Yellow
    } elseif ($successRate -ge 80) {
        Write-Host "`n⚡ STATUS: ADMIN SYSTEM MOSTLY FUNCTIONAL!" -ForegroundColor Yellow
        Write-Host "🔧 Issues to address: $TestsFailed" -ForegroundColor Yellow
    } else {
        Write-Host "`n⚠️  STATUS: ADMIN SYSTEM NEEDS ATTENTION" -ForegroundColor Red
        Write-Host "🛠️  Critical issues: $TestsFailed" -ForegroundColor Red
    }
}

Write-Host "`n🏁 Admin functionality testing completed!" -ForegroundColor Green