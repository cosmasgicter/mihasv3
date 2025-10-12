# MIHAS Admin Workflow Test - Detailed Analysis
param()

$SUPABASE_URL = "https://mylgegkqoddcrxtwcclb.supabase.co"
$SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw"
$ADMIN_EMAIL = "alexisstar8@gmail.com"
$ADMIN_PASSWORD = "Skyl3rL0m1s"

$AuthToken = $null
$TestApplicationId = $null

function Write-TestResult {
    param([string]$TestName, [bool]$Passed, [string]$Details = "")
    
    $status = if ($Passed) { "PASS" } else { "FAIL" }
    Write-Host "[$status] $TestName" -ForegroundColor $(if ($Passed) { "Green" } else { "Red" })
    
    if ($Details) {
        Write-Host "   $Details" -ForegroundColor Gray
    }
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
        
        Write-Host "Making request to: $uri" -ForegroundColor Yellow
        $response = Invoke-RestMethod @params
        return @{ Success = $true; Data = $response; Error = $null }
    }
    catch {
        Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
        }
        return @{ Success = $false; Data = $null; Error = $_.Exception.Message }
    }
}

# Step 1: Admin Authentication
Write-Host "Step 1: Admin Authentication" -ForegroundColor Cyan

$authBody = @{
    email = $ADMIN_EMAIL
    password = $ADMIN_PASSWORD
}

$authResult = Invoke-API -Endpoint "/auth/v1/token?grant_type=password" -Method "POST" -Body $authBody

if ($authResult.Success -and $authResult.Data.access_token) {
    $script:AuthToken = $authResult.Data.access_token
    Write-TestResult "Admin Login" $true "Token received: $($script:AuthToken.Substring(0, 20))..."
    Write-Host "User ID: $($authResult.Data.user.id)" -ForegroundColor Green
    Write-Host "User Email: $($authResult.Data.user.email)" -ForegroundColor Green
} else {
    Write-TestResult "Admin Login" $false "Authentication failed: $($authResult.Error)"
    exit 1
}

# Step 2: Test different table access patterns
Write-Host "`nStep 2: Testing Table Access Patterns" -ForegroundColor Cyan

# Try applications table (old name)
Write-Host "Testing 'applications' table..." -ForegroundColor Yellow
$oldAppsResult = Invoke-API -Endpoint "/rest/v1/applications?select=*&limit=5"

if ($oldAppsResult.Success) {
    Write-TestResult "Old Applications Table" $true "Retrieved $($oldAppsResult.Data.Count) applications"
} else {
    Write-TestResult "Old Applications Table" $false "Error: $($oldAppsResult.Error)"
}

# Try applications_new table
Write-Host "Testing 'applications_new' table..." -ForegroundColor Yellow
$newAppsResult = Invoke-API -Endpoint "/rest/v1/applications_new?select=*&limit=5"

if ($newAppsResult.Success) {
    Write-TestResult "New Applications Table" $true "Retrieved $($newAppsResult.Data.Count) applications"
    
    if ($newAppsResult.Data.Count -gt 0) {
        $script:TestApplicationId = $newAppsResult.Data[0].id
        Write-Host "Found test application ID: $script:TestApplicationId" -ForegroundColor Green
        
        # Show application details
        $app = $newAppsResult.Data[0]
        Write-Host "Application Details:" -ForegroundColor Cyan
        Write-Host "  ID: $($app.id)" -ForegroundColor White
        Write-Host "  Status: $($app.status)" -ForegroundColor White
        Write-Host "  User ID: $($app.user_id)" -ForegroundColor White
        Write-Host "  Created: $($app.created_at)" -ForegroundColor White
    }
} else {
    Write-TestResult "New Applications Table" $false "Error: $($newAppsResult.Error)"
}

# Step 3: Test Profiles Access
Write-Host "`nStep 3: Testing Profiles Access" -ForegroundColor Cyan

$profilesResult = Invoke-API -Endpoint "/rest/v1/profiles?select=*&limit=5"

if ($profilesResult.Success) {
    Write-TestResult "Profiles Table" $true "Retrieved $($profilesResult.Data.Count) profiles"
    
    # Find admin profile
    $adminProfile = $profilesResult.Data | Where-Object { $_.email -eq $ADMIN_EMAIL }
    if ($adminProfile) {
        Write-Host "Admin Profile Found:" -ForegroundColor Green
        Write-Host "  Name: $($adminProfile.full_name)" -ForegroundColor White
        Write-Host "  Role: $($adminProfile.role)" -ForegroundColor White
        Write-Host "  ID: $($adminProfile.id)" -ForegroundColor White
    } else {
        Write-Host "Admin profile not found in results" -ForegroundColor Red
    }
} else {
    Write-TestResult "Profiles Table" $false "Error: $($profilesResult.Error)"
}

# Step 4: Test Application Approval Workflow
if ($script:TestApplicationId) {
    Write-Host "`nStep 4: Testing Application Approval Workflow" -ForegroundColor Cyan
    
    # Get current application status
    $currentResult = Invoke-API -Endpoint "/rest/v1/applications_new?id=eq.$script:TestApplicationId&select=*"
    
    if ($currentResult.Success -and $currentResult.Data.Count -gt 0) {
        $currentApp = $currentResult.Data[0]
        $originalStatus = $currentApp.status
        
        Write-Host "Current Application Status: $originalStatus" -ForegroundColor Yellow
        
        # Test 1: Update to Approved
        Write-Host "Testing approval update..." -ForegroundColor Yellow
        
        $approveBody = @{
            status = "approved"
            reviewed_by = $ADMIN_EMAIL
            reviewed_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            admin_notes = "Application approved via admin API test - $(Get-Date)"
        }
        
        $approveResult = Invoke-API -Endpoint "/rest/v1/applications_new?id=eq.$script:TestApplicationId" -Method "PATCH" -Body $approveBody
        
        if ($approveResult.Success) {
            Write-TestResult "Approve Application" $true "Status updated to approved"
            
            # Verify the change
            Start-Sleep -Seconds 1
            $verifyResult = Invoke-API -Endpoint "/rest/v1/applications_new?id=eq.$script:TestApplicationId&select=status,reviewed_by,reviewed_at,admin_notes"
            
            if ($verifyResult.Success -and $verifyResult.Data.Count -gt 0) {
                $updatedApp = $verifyResult.Data[0]
                Write-Host "Verification Results:" -ForegroundColor Green
                Write-Host "  Status: $($updatedApp.status)" -ForegroundColor White
                Write-Host "  Reviewed By: $($updatedApp.reviewed_by)" -ForegroundColor White
                Write-Host "  Reviewed At: $($updatedApp.reviewed_at)" -ForegroundColor White
                Write-Host "  Admin Notes: $($updatedApp.admin_notes)" -ForegroundColor White
                
                if ($updatedApp.status -eq "approved") {
                    Write-TestResult "Verify Approval" $true "Status change confirmed"
                } else {
                    Write-TestResult "Verify Approval" $false "Status is $($updatedApp.status), not approved"
                }
            } else {
                Write-TestResult "Verify Approval" $false "Could not verify status change"
            }
            
            # Test 2: Update to Rejected
            Write-Host "Testing rejection update..." -ForegroundColor Yellow
            
            $rejectBody = @{
                status = "rejected"
                reviewed_by = $ADMIN_EMAIL
                reviewed_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                admin_notes = "Application rejected via admin API test - $(Get-Date)"
            }
            
            $rejectResult = Invoke-API -Endpoint "/rest/v1/applications_new?id=eq.$script:TestApplicationId" -Method "PATCH" -Body $rejectBody
            
            if ($rejectResult.Success) {
                Write-TestResult "Reject Application" $true "Status updated to rejected"
                
                # Verify rejection
                Start-Sleep -Seconds 1
                $verifyRejectResult = Invoke-API -Endpoint "/rest/v1/applications_new?id=eq.$script:TestApplicationId&select=status"
                
                if ($verifyRejectResult.Success -and $verifyRejectResult.Data[0].status -eq "rejected") {
                    Write-TestResult "Verify Rejection" $true "Rejection confirmed"
                } else {
                    Write-TestResult "Verify Rejection" $false "Rejection not confirmed"
                }
            } else {
                Write-TestResult "Reject Application" $false "Failed to reject: $($rejectResult.Error)"
            }
            
            # Test 3: Revert to Original Status
            Write-Host "Reverting to original status..." -ForegroundColor Yellow
            
            $revertBody = @{
                status = $originalStatus
                reviewed_by = $null
                reviewed_at = $null
                admin_notes = $null
            }
            
            $revertResult = Invoke-API -Endpoint "/rest/v1/applications_new?id=eq.$script:TestApplicationId" -Method "PATCH" -Body $revertBody
            
            if ($revertResult.Success) {
                Write-TestResult "Revert Status" $true "Application reverted to original status: $originalStatus"
            } else {
                Write-TestResult "Revert Status" $false "Failed to revert: $($revertResult.Error)"
            }
            
        } else {
            Write-TestResult "Approve Application" $false "Failed to approve: $($approveResult.Error)"
        }
    } else {
        Write-TestResult "Get Application for Workflow" $false "Could not retrieve application details"
    }
} else {
    Write-Host "No test application ID available for workflow testing" -ForegroundColor Red
}

# Step 5: Test Additional Admin Functions
Write-Host "`nStep 5: Testing Additional Admin Functions" -ForegroundColor Cyan

# Test Documents
Write-Host "Testing Documents..." -ForegroundColor Yellow
$docsResult = Invoke-API -Endpoint "/rest/v1/documents?select=*&limit=5"

if ($docsResult.Success) {
    Write-TestResult "Documents Access" $true "Retrieved $($docsResult.Data.Count) documents"
} else {
    Write-TestResult "Documents Access" $false "Error: $($docsResult.Error)"
}

# Test Notifications
Write-Host "Testing Notifications..." -ForegroundColor Yellow
$notificationsResult = Invoke-API -Endpoint "/rest/v1/notifications?select=*&limit=5"

if ($notificationsResult.Success) {
    Write-TestResult "Notifications Access" $true "Retrieved $($notificationsResult.Data.Count) notifications"
} else {
    Write-TestResult "Notifications Access" $false "Error: $($notificationsResult.Error)"
}

Write-Host "`nAdmin API Workflow Testing Completed!" -ForegroundColor Green