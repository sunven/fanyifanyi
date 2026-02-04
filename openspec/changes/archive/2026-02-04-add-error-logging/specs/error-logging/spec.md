## ADDED Requirements

### Requirement: Error logs are persisted to local file
The system SHALL persist error logs to a local file on all supported platforms (macOS, Linux, Windows).

#### Scenario: Log directory is created on first run
- **WHEN** the application starts for the first time
- **THEN** the log directory SHALL be created automatically
- **AND** no error SHALL occur due to missing directory

#### Scenario: Error log is written to file
- **WHEN** an error occurs in the application
- **THEN** the error message SHALL be written to the log file
- **AND** the log entry SHALL include timestamp, level, and message

### Requirement: Log files rotate automatically
The system SHALL rotate log files to prevent unbounded disk usage.

#### Scenario: Log file reaches size limit
- **WHEN** the current log file exceeds 5MB
- **THEN** it SHALL be renamed to `app.log.1`
- **AND** a new `app.log` SHALL be created for new entries
- **AND** at most 5 historical log files SHALL be retained

#### Scenario: Oldest log file is deleted
- **WHEN** more than 5 historical log files exist
- **THEN** the oldest file (`app.log.5`) SHALL be deleted
- **AND** remaining files SHALL be renumbered (`.4` → `.3`, etc.)

### Requirement: Frontend errors are caught by ErrorBoundary
The React application SHALL use ErrorBoundary to catch unhandled errors.

#### Scenario: Unhandled error in component
- **WHEN** a React component throws an error
- **THEN** the ErrorBoundary SHALL catch the error
- **AND** display a user-friendly error message
- **AND** log the error using the logging system

#### Scenario: ErrorBoundary resets on navigation
- **WHEN** the error state is set in ErrorBoundary
- **AND** the user navigates away
- **THEN** the ErrorBoundary SHALL reset its error state
- **AND** display normal content for the new route

### Requirement: Critical operations log errors with context
The system SHALL log errors with sufficient context for debugging.

#### Scenario: AI translation API error is logged
- **WHEN** the OpenAI API call fails
- **THEN** the error SHALL be logged with the request context
- **AND** the log entry SHALL include the error message and stack trace

#### Scenario: Dictionary API error is logged
- **WHEN** the Youdao dictionary API call fails
- **THEN** the error SHALL be logged with the query term
- **AND** the log entry SHALL include the network error details

### Requirement: Log level can be configured per environment
The system SHALL support different log levels for development and production.

#### Scenario: Development uses DEBUG level
- **WHEN** the application runs in development mode
- **THEN** log level SHALL be set to DEBUG
- **AND** verbose output SHALL appear in stdout

#### Scenario: Production uses INFO level
- **WHEN** the application runs in production mode
- **THEN** log level SHALL be set to INFO
- **AND** only INFO, WARN, and ERROR messages SHALL be logged to file

### Requirement: Logs are formatted consistently
The system SHALL format log entries with consistent structure.

#### Scenario: Log entry has required fields
- **WHEN** any log entry is created
- **THEN** it SHALL include timestamp in ISO 8601 format
- **AND** include log level (TRACE, DEBUG, INFO, WARN, ERROR)
- **AND** include the log message
- **AND** include source location for frontend logs

#### Scenario: Error log includes stack trace
- **WHEN** an error is logged with an Error object
- **THEN** the stack trace SHALL be included in the log entry
