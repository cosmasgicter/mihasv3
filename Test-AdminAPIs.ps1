# MIHAS Admin API Test Suite - PowerShell Version
# Tests all admin APIs including approval workflow with real production data

$SUPABASE_URL = "https://pzlqwhwkgjzjgqjpfzby.supabase.co"
$SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bHF3aHdrZ2p6amdxanBmemJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI2MzE0NzcsImV4cCI6MjA0ODIwNzQ3N30.Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8"
$ADMIN_EMAIL = "alexisstar8@gmail.com"
$ADMIN_PASSWORD = "Skyl3rL0m1s"

$global:AuthToken = $null
$global:TestApplicationId = $null
$global:TestResults = @{
    Passed = 0
    Failed = 0
    Tests = @()
}

function Write-TestResult {
    param(
        [string]$TestName,
        [bool]$Passed,
        [string]$Details = ""
    )
    
    $status = if ($Passed) { "✅ PASS" } else { "❌ FAIL" }
    Write-Host "$status`: $TestName" -ForegroundColor $(if ($Passed) { "Green" } else { "Red" })
    
    if ($Details) {
        Write-Host "   $Details" -ForegroundColor Gray
    }
    
    $global:TestResults.Tests += @{
        Name = $TestName
        Passed = $Passed
        Details = $Details
    }
    
    if ($Passed) {
        $global:TestResults.Passed++
    } else {
        $global:TestResults.Failed++
    }
}

function Invoke-SupabaseAPI {
    param(
        [string]$Endpoint,
        [string]$Method = "GET",
        [hashtable]$Body = $null,
        [hashtable]$Headers = @{}
    )
    
    $uri = "$SUPABASE_URL$Endpoint"
    $requestHeaders = @{
        "Content-Type" = "application/json"
        "apikey" = $SUPABASE_KEY
    }
    
    if ($global:AuthToken) {
        $requestHeaders["Authorization"] = "Bearer $global:AuthToken"
    }
    
    foreach ($key in $Headers.Keys) {
        $requestHeaders[$key] = $Headers[$key]
    }
    
    try {
        $params = @{
            Uri = $uri
            Method = $Method
            Headers = $requestHeaders
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

# 1. Admin Authentication Test
function Test-AdminAuth {
    Write-Host "`n🔐 Testing Admin Authentication..." -ForegroundColor Cyan
    
    $body = @{
        email = $ADMIN_EMAIL
        password = $ADMIN_PASSWORD
    }
    
    $result = Invoke-SupabaseAPI -Endpoint "/auth/v1/token?grant_type=password" -Method "POST" -Body $body
    
    if ($result.Success -and $result.Data.access_token) {
        $global:AuthToken = $result.Data.access_token
        Write-TestResult "Admin Login" $true "Token received: $($result.Data.access_token.Substring(0, 20))..."
        return $true
    } else {
        Write-TestResult "Admin Login" $false "Error: $($result.Error)"
        return $false
    }
}

# 2. Admin Profile Verification
function Test-AdminProfile {
    Write-Host "`n👤 Testing Admin Profile..." -ForegroundColor Cyan
    
    $result = Invoke-SupabaseAPI -Endpoint "/rest/v1/profiles?select=*"
    
    if ($result.Success -and $result.Data) {
        $adminProfile = $result.Data | Where-Object { $_.email -eq $ADMIN_EMAIL }
        if ($adminProfile -and $adminProfile.role -eq "admin") {
            Write-TestResult "Admin Profile Check" $true "Admin role confirmed for $($adminProfile.full_name)"
            return $true
        } else {
            Write-TestResult "Admin Profile Check" $false "Admin role not found"
            return $false
        }
    } else {
        Write-TestResult "Admin Profile Check" $false "Error: $($result.Error)"
        return $false
    }
}

# 3. Get All Applications
function Test-GetAllApplications {
    Write-Host "`n📋 Testing Get All Applications..." -ForegroundColor Cyan
    
    $result = Invoke-SupabaseAPI -Endpoint "/rest/v1/applications_new?select=*,profiles(full_name,email),programs(name),intakes(name)"
    
    if ($result.Success -and $result.Data) {
        Write-TestResult "Get All Applications" $true "Retrieved $($result.Data.Count) applications"
        
        # Find a pending application for approval tests
        $pendingApp = $result.Data | Where-Object { $_.status -eq "pending" -or $_.status -eq "submitted" } | Select-Object -First 1
        if ($pendingApp) {
            $global:TestApplicationId = $pendingApp.id
            Write-TestResult "Found Pending Application" $true "Application ID: $global:TestApplicationId"
        }
        
        return $result.Data
    } else {
        Write-TestResult "Get All Applications" $false "Error: $($result.Error)"
        return @()
    }
}

# 4. Application Details
function Test-GetApplicationDetails {
    if (-not $global:TestApplicationId) {
        Write-TestResult "Get Application Details" $false "No test application ID available"
        return $null
    }
    
    Write-Host "`n📄 Testing Get Application Details..." -ForegroundColor Cyan
    
    $result = Invoke-SupabaseAPI -Endpoint "/rest/v1/applications_new?id=eq.$global:TestApplicationId&select=*,profiles(full_name,email),programs(name),intakes(name)"
    
    if ($result.Success -and $result.Data -and $result.Data.Count -gt 0) {
        $application = $result.Data[0]
        Write-TestResult "Get Application Details" $true "Retrieved application for $($application.profiles.full_name)"
        return $application
    } else {
        Write-TestResult "Get Application Details" $false "Error: $($result.Error)"
        return $null
    }
}

# 5. Approval Workflow (Core Test)
function Test-ApprovalWorkflow {
    if (-not $global:TestApplicationId) {
        Write-TestResult "Approval Workflow" $false "No test application ID available"
        return $false
    }
    
    Write-Host "`n✅ Testing Approval Workflow..." -ForegroundColor Cyan
    
    try {
        # Get original status
        $originalResult = Invoke-SupabaseAPI -Endpoint "/rest/v1/applications_new?id=eq.$global:TestApplicationId&select=status,reviewed_by,reviewed_at,admin_notes"
        $originalData = $originalResult.Data[0]
        
        # Test 1: Approve Application
        $approveBody = @{
            status = "approved"
            reviewed_by = $ADMIN_EMAIL
            reviewed_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            admin_notes = "Application approved via API test"
        }
        
        $approveResult = Invoke-SupabaseAPI -Endpoint "/rest/v1/applications_new?id=eq.$global:TestApplicationId" -Method "PATCH" -Body $approveBody
        
        if ($approveResult.Success) {
            Write-TestResult "Approve Application" $true "Application status updated to approved"
            
            # Test 2: Verify status change
            $verifyResult = Invoke-SupabaseAPI -Endpoint "/rest/v1/applications_new?id=eq.$global:TestApplicationId&select=status,reviewed_by,reviewed_at,admin_notes"
            
            if ($verifyResult.Success -and $verifyResult.Data[0].status -eq "approved") {
                Write-TestResult "Verify Approval Status" $true "Status change confirmed"
                
                # Test 3: Reject Application
                $rejectBody = @{
                    status = "rejected"
                    reviewed_by = $ADMIN_EMAIL
                    reviewed_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                    admin_notes = "Application rejected via API test"
                }
                
                $rejectResult = Invoke-SupabaseAPI -Endpoint "/rest/v1/applications_new?id=eq.$global:TestApplicationId" -Method "PATCH" -Body $rejectBody
                
                if ($rejectResult.Success) {
                    Write-TestResult "Reject Application" $true "Application status updated to rejected"
                    
                    # Test 4: Revert to original status
                    $revertBody = @{
                        status = $originalData.status
                        reviewed_by = $originalData.reviewed_by
                        reviewed_at = $originalData.reviewed_at
                        admin_notes = $originalData.admin_notes
                    }
                    
                    $revertResult = Invoke-SupabaseAPI -Endpoint "/rest/v1/applications_new?id=eq.$global:TestApplicationId" -Method "PATCH" -Body $revertBody
                    
                    if ($revertResult.Success) {
                        Write-TestResult "Revert Status" $true "Application reverted to original status"
                        return $true
                    } else {
                        Write-TestResult "Revert Status" $false "Failed to revert status"
                        return $false
                    }
                } else {
                    Write-TestResult "Reject Application" $false "Failed to reject application"
                    return $false
                }
            } else {
                Write-TestResult "Verify Approval Status" $false "Status change not confirmed"
                return $false
            }
        } else {
            Write-TestResult "Approve Application" $false "Error: $($approveResult.Error)"
            return $false
        }
    }
    catch {
        Write-TestResult "Approval Workflow" $false "Exception: $($_.Exception.Message)"
        return $false
    }
}

# 6. Admin Statistics
function Test-AdminStatistics {
    Write-Host "`n📊 Testing Admin Statistics..." -ForegroundColor Cyan
    
    $result = Invoke-SupabaseAPI -Endpoint "/rest/v1/applications_new?select=status"
    
    if ($result.Success -and $result.Data) {
        $stats = @{}
        foreach ($app in $result.Data) {
            if ($stats.ContainsKey($app.status)) {
                $stats[$app.status]++
            } else {
                $stats[$app.status] = 1
            }
        }
        
        $statsJson = $stats | ConvertTo-Json -Compress
        Write-TestResult "Admin Statistics" $true "Stats: $statsJson"
        return $stats
    } else {
        Write-TestResult "Admin Statistics" $false "Error: $($result.Error)"
        return $null
    }
}

# 7. Programs Management
function Test-ProgramsManagement {
    Write-Host "`n🎓 Testing Programs Management..." -ForegroundColor Cyan
    
    $result = Invoke-SupabaseAPI -Endpoint "/rest/v1/programs?select=*"
    
    if ($result.Success -and $result.Data) {
        Write-TestResult "Get Programs" $true "Retrieved $($result.Data.Count) programs"
        
        if ($result.Data.Count -gt 0) {
            $program = $result.Data[0]
            Write-TestResult "Program Details" $true "Program: $($program.name) ($($program.code))"
        }
        
        return $result.Data
    } else {
        Write-TestResult "Get Programs" $false "Error: $($result.Error)"
        return @()
    }
}

# 8. Document Management
function Test-DocumentManagement {
    if (-not $global:TestApplicationId) {
        Write-TestResult "Document Management" $false "No test application ID available"
        return @()
    }
    
    Write-Host "`n📎 Testing Document Management..." -ForegroundColor Cyan
    
    $result = Invoke-SupabaseAPI -Endpoint "/rest/v1/documents?application_id=eq.$global:TestApplicationId&select=*"
    
    if ($result.Success) {
        Write-TestResult "Get Application Documents" $true "Retrieved $($result.Data.Count) documents"
        
        if ($result.Data.Count -gt 0) {
            $doc = $result.Data[0]
            Write-TestResult "Document Details" $true "Document: $($doc.document_type) - $($doc.file_name)"
        }
        
        return $result.Data
    } else {
        Write-TestResult "Get Application Documents" $false "Error: $($result.Error)"
        return @()
    }
}

# Main Test Runner
function Start-AdminTests {
    Write-Host "🚀 Starting MIHAS Admin API Tests - Production Environment" -ForegroundColor Yellow
    Write-Host ("=" * 60) -ForegroundColor Yellow
    
    $startTime = Get-Date
    
    # Reset test results
    $global:TestResults = @{
        Passed = 0
        Failed = 0
        Tests = @()
    }
    
    # Run all tests
    $authSuccess = Test-AdminAuth
    if (-not $authSuccess) {
        Write-Host "`n❌ Authentication failed. Cannot proceed with other tests." -ForegroundColor Red
        return
    }
    
    Test-AdminProfile
    Test-GetAllApplications
    Test-GetApplicationDetails
    Test-ApprovalWorkflow
    Test-AdminStatistics
    Test-ProgramsManagement
    Test-DocumentManagement
    
    # Final Results
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalSeconds
    
    Write-Host "`n$("=" * 60)" -ForegroundColor Yellow
    Write-Host "📊 ADMIN API TEST RESULTS" -ForegroundColor Yellow
    Write-Host ("=" * 60) -ForegroundColor Yellow
    Write-Host "✅ Passed: $($global:TestResults.Passed)" -ForegroundColor Green
    Write-Host "❌ Failed: $($global:TestResults.Failed)" -ForegroundColor Red
    Write-Host "⏱️  Duration: $([math]::Round($duration, 2))s" -ForegroundColor Cyan
    
    $successRate = if (($global:TestResults.Passed + $global:TestResults.Failed) -gt 0) {
        [math]::Round(($global:TestResults.Passed / ($global:TestResults.Passed + $global:TestResults.Failed)) * 100, 1)
    } else { 0 }
    
    Write-Host "🎯 Success Rate: $successRate%" -ForegroundColor Cyan
    
    if ($global:TestResults.Failed -gt 0) {
        Write-Host "`n❌ Failed Tests:" -ForegroundColor Red
        $global:TestResults.Tests | Where-Object { -not $_.Passed } | ForEach-Object {
            Write-Host "   - $($_.Name): $($_.Details)" -ForegroundColor Red
        }
    }
    
    Write-Host "`n🏁 Admin API testing completed!" -ForegroundColor Green
}

# Run the tests
Start-AdminTests