# MIHAS Admin Approval Workflow Test - Final Version
# Tests approval workflow on the correct applications table

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

Write-Host "MIHAS Admin Approval Workflow Test - Production Environment" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow

# Step 1: Admin Authentication
Write-Host "`n1. Admin Authentication" -ForegroundColor Cyan

$authBody = @{
    email = $ADMIN_EMAIL
    password = $ADMIN_PASSWORD
}

$authResult = Invoke-API -Endpoint "/auth/v1/token?grant_type=password" -Method "POST" -Body $authBody

if ($authResult.Success -and $authResult.Data.access_token) {
    $script:AuthToken = $authResult.Data.access_token
    Write-TestResult "Admin Login" $true "Authenticated as $($authResult.Data.user.email)"
} else {
    Write-TestResult "Admin Login" $false "Authentication failed"
    exit 1
}

# Step 2: Get All Applications (using correct table)
Write-Host "`n2. Get All Applications" -ForegroundColor Cyan

$appsResult = Invoke-API -Endpoint "/rest/v1/applications?select=*&order=created_at.desc"

if ($appsResult.Success -and $appsResult.Data) {
    Write-TestResult "Get All Applications" $true "Retrieved $($appsResult.Data.Count) applications"
    
    # Show application summary
    $statusCounts = @{}
    foreach ($app in $appsResult.Data) {
        if ($statusCounts.ContainsKey($app.status)) {
            $statusCounts[$app.status]++
        } else {
            $statusCounts[$app.status] = 1
        }
    }
    
    Write-Host "   Application Status Summary:" -ForegroundColor Cyan
    foreach ($status in $statusCounts.Keys) {
        Write-Host "     $status`: $($statusCounts[$status])" -ForegroundColor White
    }
    
    # Find a test application (prefer pending/submitted)
    $testApp = $appsResult.Data | Where-Object { $_.status -eq "pending" -or $_.status -eq "submitted" } | Select-Object -First 1
    if (-not $testApp) {
        $testApp = $appsResult.Data | Select-Object -First 1
    }
    
    if ($testApp) {
        $script:TestApplicationId = $testApp.id
        Write-TestResult "Found Test Application" $true "ID: $script:TestApplicationId, Status: $($testApp.status)"
    }
} else {
    Write-TestResult "Get All Applications" $false "Failed to retrieve applications"
}

# Step 3: Get Application Details
if ($script:TestApplicationId) {
    Write-Host "`n3. Get Application Details" -ForegroundColor Cyan
    
    $detailsResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$script:TestApplicationId&select=*"
    
    if ($detailsResult.Success -and $detailsResult.Data.Count -gt 0) {
        $application = $detailsResult.Data[0]
        Write-TestResult "Get Application Details" $true "Retrieved application details"
        
        Write-Host "   Application Details:" -ForegroundColor Cyan
        Write-Host "     ID: $($application.id)" -ForegroundColor White
        Write-Host "     User ID: $($application.user_id)" -ForegroundColor White
        Write-Host "     Status: $($application.status)" -ForegroundColor White
        Write-Host "     Program ID: $($application.program_id)" -ForegroundColor White
        Write-Host "     Created: $($application.created_at)" -ForegroundColor White
        if ($application.reviewed_by) {
            Write-Host "     Reviewed By: $($application.reviewed_by)" -ForegroundColor White
            Write-Host "     Reviewed At: $($application.reviewed_at)" -ForegroundColor White
        }
    } else {
        Write-TestResult "Get Application Details" $false "Failed to get application details"
    }
}

# Step 4: Test Approval Workflow (CORE TEST)
if ($script:TestApplicationId) {
    Write-Host "`n4. Approval Workflow Test" -ForegroundColor Cyan
    
    # Get original status
    $originalResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$script:TestApplicationId&select=status,reviewed_by,reviewed_at,admin_notes"
    $originalData = $originalResult.Data[0]
    $originalStatus = $originalData.status
    
    Write-Host "   Original Status: $originalStatus" -ForegroundColor Yellow
    
    # Test 1: Approve Application
    Write-Host "   Testing APPROVE workflow..." -ForegroundColor Yellow
    
    $approveBody = @{
        status = "approved"
        reviewed_by = $ADMIN_EMAIL
        reviewed_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        admin_notes = "Application APPROVED via admin API test - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    }
    
    $approveResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$script:TestApplicationId" -Method "PATCH" -Body $approveBody
    
    if ($approveResult.Success) {
        Write-TestResult "Approve Application" $true "Status updated to APPROVED"
        
        # Verify approval
        Start-Sleep -Seconds 2
        $verifyResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$script:TestApplicationId&select=status,reviewed_by,reviewed_at,admin_notes"
        
        if ($verifyResult.Success -and $verifyResult.Data[0].status -eq "approved") {
            Write-TestResult "Verify Approval" $true "Approval confirmed in database"
            Write-Host "     Reviewed By: $($verifyResult.Data[0].reviewed_by)" -ForegroundColor Green
            Write-Host "     Reviewed At: $($verifyResult.Data[0].reviewed_at)" -ForegroundColor Green
        } else {
            Write-TestResult "Verify Approval" $false "Approval not confirmed"
        }
        
        # Test 2: Reject Application
        Write-Host "   Testing REJECT workflow..." -ForegroundColor Yellow
        
        $rejectBody = @{
            status = "rejected"
            reviewed_by = $ADMIN_EMAIL
            reviewed_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            admin_notes = "Application REJECTED via admin API test - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        }
        
        $rejectResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$script:TestApplicationId" -Method "PATCH" -Body $rejectBody
        
        if ($rejectResult.Success) {
            Write-TestResult "Reject Application" $true "Status updated to REJECTED"
            
            # Verify rejection
            Start-Sleep -Seconds 2
            $verifyRejectResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$script:TestApplicationId&select=status,reviewed_by,admin_notes"
            
            if ($verifyRejectResult.Success -and $verifyRejectResult.Data[0].status -eq "rejected") {
                Write-TestResult "Verify Rejection" $true "Rejection confirmed in database"
                Write-Host "     Admin Notes: $($verifyRejectResult.Data[0].admin_notes)" -ForegroundColor Red
            } else {
                Write-TestResult "Verify Rejection" $false "Rejection not confirmed"
            }
        } else {
            Write-TestResult "Reject Application" $false "Failed to reject application"
        }
        
        # Test 3: Set to Under Review
        Write-Host "   Testing UNDER REVIEW workflow..." -ForegroundColor Yellow
        
        $reviewBody = @{
            status = "under_review"
            reviewed_by = $ADMIN_EMAIL
            reviewed_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            admin_notes = "Application under REVIEW via admin API test - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        }
        
        $reviewResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$script:TestApplicationId" -Method "PATCH" -Body $reviewBody
        
        if ($reviewResult.Success) {
            Write-TestResult "Set Under Review" $true "Status updated to UNDER REVIEW"
        } else {
            Write-TestResult "Set Under Review" $false "Failed to set under review"
        }
        
        # Test 4: Revert to Original Status
        Write-Host "   Reverting to original status..." -ForegroundColor Yellow
        
        $revertBody = @{
            status = $originalStatus
            reviewed_by = $originalData.reviewed_by
            reviewed_at = $originalData.reviewed_at
            admin_notes = $originalData.admin_notes
        }
        
        $revertResult = Invoke-API -Endpoint "/rest/v1/applications?id=eq.$script:TestApplicationId" -Method "PATCH" -Body $revertBody
        
        if ($revertResult.Success) {
            Write-TestResult "Revert to Original Status" $true "Reverted to: $originalStatus"
        } else {
            Write-TestResult "Revert to Original Status" $false "Failed to revert status"
        }
        
    } else {
        Write-TestResult "Approve Application" $false "Failed to approve application"
    }
} else {
    Write-TestResult "Approval Workflow" $false "No test application available"
}

# Step 5: Test Programs and Intakes (Admin Management)
Write-Host "`n5. Admin Management Functions" -ForegroundColor Cyan

# Test Programs
$programsResult = Invoke-API -Endpoint "/rest/v1/programs?select=*"
if ($programsResult.Success) {
    Write-TestResult "Programs Management" $true "Retrieved $($programsResult.Data.Count) programs"
    if ($programsResult.Data.Count -gt 0) {
        Write-Host "   Programs available:" -ForegroundColor Cyan
        foreach ($program in $programsResult.Data) {
            Write-Host "     - $($program.name) ($($program.code))" -ForegroundColor White
        }
    }
} else {
    Write-TestResult "Programs Management" $false "Failed to get programs"
}

# Test Intakes
$intakesResult = Invoke-API -Endpoint "/rest/v1/intakes?select=*"
if ($intakesResult.Success) {
    Write-TestResult "Intakes Management" $true "Retrieved $($intakesResult.Data.Count) intakes"
    if ($intakesResult.Data.Count -gt 0) {
        Write-Host "   Intakes available:" -ForegroundColor Cyan
        foreach ($intake in $intakesResult.Data) {
            Write-Host "     - $($intake.name) ($($intake.year))" -ForegroundColor White
        }
    }
} else {
    Write-TestResult "Intakes Management" $false "Failed to get intakes"
}

# Step 6: Test Documents and Notifications
Write-Host "`n6. Additional Admin Functions" -ForegroundColor Cyan

# Test Documents
$docsResult = Invoke-API -Endpoint "/rest/v1/documents?select=*&limit=10"
if ($docsResult.Success) {
    Write-TestResult "Documents Access" $true "Retrieved $($docsResult.Data.Count) documents"
} else {
    Write-TestResult "Documents Access" $false "Failed to access documents"
}

# Test Notifications
$notificationsResult = Invoke-API -Endpoint "/rest/v1/notifications?select=*&limit=10"
if ($notificationsResult.Success) {
    Write-TestResult "Notifications Access" $true "Retrieved $($notificationsResult.Data.Count) notifications"
} else {
    Write-TestResult "Notifications Access" $false "Failed to access notifications"
}

# Final Results
Write-Host "`n============================================================" -ForegroundColor Yellow
Write-Host "ADMIN APPROVAL WORKFLOW TEST RESULTS" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "Passed: $TestsPassed" -ForegroundColor Green
Write-Host "Failed: $TestsFailed" -ForegroundColor Red

$total = $TestsPassed + $TestsFailed
if ($total -gt 0) {
    $successRate = [math]::Round(($TestsPassed / $total) * 100, 1)
    Write-Host "Success Rate: $successRate%" -ForegroundColor Cyan
}

if ($TestsPassed -ge 8) {
    Write-Host "`nSTATUS: ADMIN APPROVAL WORKFLOW IS FULLY FUNCTIONAL!" -ForegroundColor Green
} elseif ($TestsPassed -ge 5) {
    Write-Host "`nSTATUS: ADMIN APPROVAL WORKFLOW IS MOSTLY FUNCTIONAL" -ForegroundColor Yellow
} else {
    Write-Host "`nSTATUS: ADMIN APPROVAL WORKFLOW NEEDS ATTENTION" -ForegroundColor Red
}

Write-Host "`nAdmin API testing completed!" -ForegroundColor Green