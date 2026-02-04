## ADDED Requirements

### Requirement: Error state persistence
The system SHALL preserve update information when download or installation fails, allowing users to retry the update.

#### Scenario: Download failure preserves update info
- **WHEN** update download fails due to network error, signature verification failure, or other error
- **THEN** system SHALL retain the `updateInfo` (version, date, release notes)
- **AND** system SHALL retain the `updateHandle` for retry operations
- **AND** system SHALL set an `error` state with the failure reason
- **AND** system SHALL NOT clear the `hasUpdate` state

#### Scenario: Error persists until user action
- **WHEN** an error state is set due to download/install failure
- **THEN** the error SHALL persist until user explicitly performs an action
- **AND** the error SHALL NOT be automatically cleared after a timeout
- **AND** the error SHALL be preserved across page refreshes

### Requirement: Manual retry mechanism
The system SHALL provide a manual retry option for failed updates.

#### Scenario: Retry download after failure
- **WHEN** update download fails and error is displayed
- **THEN** system SHALL display a "Retry Download" button
- **AND** system SHALL clear the error state when retry is initiated
- **AND** system SHALL reuse the existing `updateHandle` for retry
- **AND** the `updateInfo` SHALL remain visible during retry

#### Scenario: Re-check for updates
- **WHEN** user clicks "Re-check" button after an error
- **THEN** system SHALL initiate a new update check
- **AND** system SHALL clear previous error state
- **AND** if new update is found, system SHALL replace the `updateInfo`
- **AND** if no update is found, system SHALL clear `hasUpdate` and `updateInfo`

### Requirement: Download in-progress state
The system SHALL track and display download progress to prevent duplicate download requests.

#### Scenario: Prevent duplicate downloads
- **WHEN** a download operation is in progress
- **THEN** system SHALL set `isDownloading` state to true
- **AND** system SHALL disable the download/update button
- **AND** system SHALL prevent additional `downloadAndInstall()` calls

#### Scenario: Download completion clears in-progress state
- **WHEN** download completes successfully or fails
- **THEN** system SHALL set `isDownloading` state to false
- **AND** system SHALL re-enable the download/update button

### Requirement: User-friendly error messages
The system SHALL map technical errors to user-friendly messages.

#### Scenario: Network error mapping
- **WHEN** download fails due to network connectivity issues
- **THEN** system SHALL display "网络连接失败，请检查网络设置"
- **AND** system SHALL classify the error as retryable

#### Scenario: Signature verification error mapping
- **WHEN** signature verification fails
- **THEN** system SHALL display "更新包签名验证失败，请联系开发者"
- **AND** system SHALL classify the error as non-retryable

#### Scenario: Server error mapping
- **WHEN** download fails with 404 or 5xx status
- **THEN** system SHALL display "未找到更新服务器或文件，请稍后再试"
- **AND** system SHALL classify the error as retryable

#### Scenario: Unknown error fallback
- **WHEN** error type cannot be determined
- **THEN** system SHALL display "更新失败: {error message}"
- **AND** system SHALL log the full error for debugging

## MODIFIED Requirements

### Requirement: Download and install update
The system SHALL download the update package for the current platform and install it.

#### Scenario: Successful download and install
- **WHEN** user confirms download of available update
- **THEN** system downloads the platform-specific update package
- **AND** system displays download progress
- **AND** system verifies the package signature
- **AND** system installs the update
- **AND** system prompts user to relaunch the application

#### Scenario: Download progress
- **WHEN** update package is downloading
- **THEN** system reports progress events including chunk size and total size
- **AND** UI displays progress percentage to user

#### Scenario: Signature verification failure
- **WHEN** the downloaded package signature cannot be verified
- **THEN** system aborts the installation
- **AND** system displays an error message indicating verification failure
- **AND** system SHALL preserve the `updateInfo` so user can retry after the issue is resolved
- **AND** system SHALL provide option to skip this version

#### Scenario: Download failure with retry
- **WHEN** download fails due to network issues or server errors
- **THEN** system displays a user-friendly error message
- **AND** system SHALL preserve the `updateInfo` and `updateHandle`
- **AND** system SHALL provide a "Retry" button to attempt download again
- **AND** system SHALL log the error for debugging

#### Scenario: Installation failure
- **WHEN** installation fails after successful download
- **THEN** system displays an error message with failure reason
- **AND** system SHALL preserve update information for potential retry
- **AND** system MAY prompt user to manually download and install
