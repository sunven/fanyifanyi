## ADDED Requirements

### Requirement: Check for updates
The system SHALL check for application updates by fetching a JSON manifest from a configured endpoint. The endpoint MUST use a unified JSON format containing all supported platforms.

#### Scenario: Successful update check
- **WHEN** user triggers update check or app checks automatically
- **THEN** system requests the updater JSON from the configured endpoint
- **AND** system parses the JSON response
- **AND** if a newer version is available, system returns update information

#### Scenario: No update available
- **WHEN** the latest version in JSON matches or is older than current app version
- **THEN** system indicates no update is available

#### Scenario: Network error during check
- **WHEN** the updater endpoint cannot be reached
- **THEN** system displays a user-friendly error message
- **AND** system logs the error for debugging

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

### Requirement: Unified updater JSON format
The updater JSON manifest SHALL follow Tauri v2 official specification with a `platforms` object containing all supported platforms.

#### Scenario: JSON structure compliance
- **WHEN** the updater JSON is generated
- **THEN** it MUST include `version` field with valid SemVer
- **AND** it MUST include `pub_date` field with RFC 3339 formatted date
- **AND** it MUST include `notes` field with release notes
- **AND** it MUST include `platforms` object with platform-specific data
- **AND** each platform entry MUST include `signature` and `url` fields

#### Scenario: Platform key format
- **WHEN** defining platform keys in the JSON
- **THEN** keys MUST use `OS-ARCH` format (e.g., `darwin-aarch64`, `linux-x86_64`, `windows-x86_64`)
- **AND** OS values MUST be one of: `linux`, `darwin`, `windows`
- **AND** ARCH values MUST be one of: `x86_64`, `aarch64`, `i686`, `armv7`

### Requirement: Update endpoint configuration
The system SHALL be configured with endpoints that serve the unified updater JSON.

#### Scenario: Endpoint configuration
- **WHEN** the updater endpoint is configured
- **THEN** it MUST point to a `latest.json` or versioned JSON file
- **AND** it MUST NOT use `{{target}}` or `{{arch}}` variables for multi-platform JSON
- **AND** the endpoint MUST use HTTPS in production

#### Scenario: GitHub Releases integration
- **WHEN** using GitHub Releases as the update source
- **THEN** the endpoint SHALL be `https://github.com/{owner}/{repo}/releases/latest/download/latest.json`
- **AND** the `latest.json` file SHALL be uploaded as a release asset
