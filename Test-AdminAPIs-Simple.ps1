# MIHAS Admin API Test Suite - Simple PowerShell Version
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

# Test 1: Admin Authentication
Write-Host "`nTesting Admin Authentication..." -ForegroundColor Cyan

$authBody = @{
    email = $ADMIN_EMAIL
    password = $ADMIN_PASSWORD
}

$authResult = Invoke-API -Endpoint "/auth/v1/token?grant_type=password" -Method "POST" -Body $authBody

if ($authResult.Success -and $authResult.Data.access_token) {
    $script:AuthToken = $authResult.Data.access_token
    Write-TestResult "Admin Login" $true "Token received"
} else {
    Write-TestResult "Admin Login" $false "Authentication failed: $($authResult.Error)"
    Write-Host "Cannot proceed without authentication. Exiting." -ForegroundColor Red
    exit 1
}

# Test 2: Admin Profile Check
Write-Host "`nTesting Admin Profile..." -ForegroundColor Cyan

$profileResult = Invoke-API -Endpoint "/rest/v1/profiles?select=*"

if ($profileResult.Success -and $profileResult.Data) {
    $adminProfile = $profileResult.Data | Where-Object { $_.email -eq $ADMIN_EMAIL }
    if ($adminProfile -and $adminProfile.role -eq "admin") {
        Write-TestResult "Admin Profile Check" $true "Admin role confirmed for $($adminProfile.full_name)"
    } else {
        Write-TestResult "Admin Profile Check" $false "Admin role not found"
    }
} else {
    Write-TestResult "Admin Profile Check" $false "Profile check failed: $($profileResult.Error)"
}

# Test 3: Get All Applications
Write-Host "`nTesting Get All Applications..." -ForegroundColor Cyan

$appsResult = Invoke-API -Endpoint "/rest/v1/applications_new?select=*,profiles(full_name,email),programs(name),intakes(name)"

if ($appsResult.Success -and $appsResult.Data) {
    Write-TestResult "Get All Applications" $true "Retrieved $($appsResult.Data.Count) applications"
    
    # Find a pending application for approval tests
    $pendingApp = $appsResult.Data | Where-Object { $_.status -eq "pending" -or $_.status -eq "submitted" } | Select-Object -First 1
    if ($pendingApp) {
        $script:TestApplicationId = $pendingApp.id
        Write-TestResult "Found Test Application" $true "Application ID: $script:TestApplicationId"
    } else {
        Write-TestResult "Found Test Application" $false "No pending applications found"
    }
} else {
    Write-TestResult "Get All Applications" $false "Failed to get applications: $($appsResult.Error)"
}

# Test 4: Application Details
if ($script:TestApplicationId) {
    Write-Host "`nTesting Get Application Details..." -ForegroundColor Cyan
    
    $detailsResult = Invoke-API -Endpoint "/rest/v1/applications_new?id=eq.$script:TestApplicationId&select=*,profiles(full_name,email),programs(name),intakes(name)"
    
    if ($detailsResult.Success -and $detailsResult.Data -and $detailsResult.Data.Count -gt 0) {
        $application = $detailsResult.Data[0]
        Write-TestResult "Get Application Details" $true "Retrieved application for $($application.profiles.full_name)"
    } else {
        Write-TestResult "Get Application Details" $false "Failed to get application details"
    }
}

# Test 5: Approval Workflow (Core Test)
if ($script:TestApplicationId) {
    Write-Host "`nTesting Approval Workflow..." -ForegroundColor Cyan
    
    # Get original status first
    $originalResult = Invoke-API -Endpoint "/rest/v1/applications_new?id=eq.$script:TestApplicationId&select=status,reviewed_by,reviewed_at,admin_notes"
    $originalData = $originalResult.Data[0]
    
    # Test Approve Application
    $approveBody = @{
        status = "approved"
        reviewed_by = $ADMIN_EMAIL
        reviewed_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        admin_notes = "Application approved via API test"
    }
    
    $approveResult = Invoke-API -Endpoint "/rest/v1/applications_new?id=eq.$script:TestApplicationId" -Method "PATCH" -Body $approveBody
    
    if ($approveResult.Success) {
        Write-TestResult "Approve Application" $true "Status updated to approved"
        
        # Verify status change
        $verifyResult = Invoke-API -Endpoint "/rest/v1/applications_new?id=eq.$script:TestApplicationId&select=status"
        
        if ($verifyResult.Success -and $verifyResult.Data[0].status -eq "approved") {
            Write-TestResult "Verify Approval Status" $true "Status change confirmed"
            
            # Test Reject Application
            $rejectBody = @{
                status = "rejected"
                reviewed_by = $ADMIN_EMAIL
                reviewed_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                admin_notes = "Application rejected via API test"
            }
            
            $rejectResult = Invoke-API -Endpoint "/rest/v1/applications_new?id=eq.$script:TestApplicationId" -Method "PATCH" -Body $rejectBody
            
            if ($rejectResult.Success) {
                Write-TestResult "Reject Application" $true "Status updated to rejected"
                
                # Revert to original status
                $revertBody = @{
                    status = $originalData.status
                    reviewed_by = $originalData.reviewed_by
                    reviewed_at = $originalData.reviewed_at
                    admin_notes = $originalData.admin_notes
                }
                
                $revertResult = Invoke-API -Endpoint "/rest/v1/applications_new?id=eq.$script:TestApplicationId" -Method "PATCH" -Body $revertBody
                
                if ($revertResult.Success) {
                    Write-TestResult "Revert Status" $true "Application reverted to original status"
                } else {
                    Write-TestResult "Revert Status" $false "Failed to revert status"
                }
            } else {
                Write-TestResult "Reject Application" $false "Failed to reject application"
            }
        } else {
            Write-TestResult "Verify Approval Status" $false "Status change not confirmed"
        }
    } else {
        Write-TestResult "Approve Application" $false "Failed to approve application: $($approveResult.Error)"
    }
}

# Test 6: Admin Statistics
Write-Host "`nTesting Admin Statistics..." -ForegroundColor Cyan

$statsResult = Invoke-API -Endpoint "/rest/v1/applications_new?select=status"

if ($statsResult.Success -and $statsResult.Data) {
    $stats = @{}
    foreach ($app in $statsResult.Data) {
        if ($stats.ContainsKey($app.status)) {
            $stats[$app.status]++
        } else {
            $stats[$app.status] = 1
        }
    }
    
    $statsText = ($stats.GetEnumerator() | ForEach-Object { "$($_.Key): $($_.Value)" }) -join ", "
    Write-TestResult "Admin Statistics" $true "Stats: $statsText"
} else {
    Write-TestResult "Admin Statistics" $false "Failed to get statistics"
}

# Test 7: Programs Management
Write-Host "`nTesting Programs Management..." -ForegroundColor Cyan

$programsResult = Invoke-API -Endpoint "/rest/v1/programs?select=*"

if ($programsResult.Success -and $programsResult.Data) {
    Write-TestResult "Get Programs" $true "Retrieved $($programsResult.Data.Count) programs"
    
    if ($programsResult.Data.Count -gt 0) {
        $program = $programsResult.Data[0]
        Write-TestResult "Program Details" $true "Program: $($program.name) ($($program.code))"
    }
} else {
    Write-TestResult "Get Programs" $false "Failed to get programs"
}

# Test 8: Intakes Management
Write-Host "`nTesting Intakes Management..." -ForegroundColor Cyan

$intakesResult = Invoke-API -Endpoint "/rest/v1/intakes?select=*"

if ($intakesResult.Success -and $intakesResult.Data) {
    Write-TestResult "Get Intakes" $true "Retrieved $($intakesResult.Data.Count) intakes"
    
    if ($intakesResult.Data.Count -gt 0) {
        $intake = $intakesResult.Data[0]
        Write-TestResult "Intake Details" $true "Intake: $($intake.name) ($($intake.year))"
    }
} else {
    Write-TestResult "Get Intakes" $false "Failed to get intakes"
}

# Test 9: Document Management
if ($script:TestApplicationId) {
    Write-Host "`nTesting Document Management..." -ForegroundColor Cyan
    
    $docsResult = Invoke-API -Endpoint "/rest/v1/documents?application_id=eq.$script:TestApplicationId&select=*"
    
    if ($docsResult.Success) {
        Write-TestResult "Get Application Documents" $true "Retrieved $($docsResult.Data.Count) documents"
        
        if ($docsResult.Data.Count -gt 0) {
            $doc = $docsResult.Data[0]
            Write-TestResult "Document Details" $true "Document: $($doc.document_type) - $($doc.file_name)"
        }
    } else {
        Write-TestResult "Get Application Documents" $false "Failed to get documents"
    }
}

# Test 10: User Management
Write-Host "`nTesting User Management..." -ForegroundColor Cyan

$usersResult = Invoke-API -Endpoint "/rest/v1/profiles?select=*&limit=10"

if ($usersResult.Success -and $usersResult.Data) {
    Write-TestResult "Get Users" $true "Retrieved $($usersResult.Data.Count) user profiles"
    
    $roleStats = @{}
    foreach ($user in $usersResult.Data) {
        $role = if ($user.role) { $user.role } else { "student" }
        if ($roleStats.ContainsKey($role)) {
            $roleStats[$role]++
        } else {
            $roleStats[$role] = 1
        }
    }
    
    $roleText = ($roleStats.GetEnumerator() | ForEach-Object { "$($_.Key): $($_.Value)" }) -join ", "
    Write-TestResult "User Role Distribution" $true "Roles: $roleText"
} else {
    Write-TestResult "Get Users" $false "Failed to get users"
}

# Final Results
Write-Host "`n============================================================" -ForegroundColor Yellow
Write-Host "ADMIN API TEST RESULTS" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "Passed: $TestsPassed" -ForegroundColor Green
Write-Host "Failed: $TestsFailed" -ForegroundColor Red

$total = $TestsPassed + $TestsFailed
if ($total -gt 0) {
    $successRate = [math]::Round(($TestsPassed / $total) * 100, 1)
    Write-Host "Success Rate: $successRate%" -ForegroundColor Cyan
}

Write-Host "`nAdmin API testing completed!" -ForegroundColor Green