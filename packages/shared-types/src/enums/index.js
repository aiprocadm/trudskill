export var EntityStatus;
(function (EntityStatus) {
    EntityStatus["Active"] = "active";
    EntityStatus["Inactive"] = "inactive";
    EntityStatus["Archived"] = "archived";
})(EntityStatus || (EntityStatus = {}));
export var UserStatus;
(function (UserStatus) {
    UserStatus["Invited"] = "invited";
    UserStatus["Active"] = "active";
    UserStatus["Suspended"] = "suspended";
    UserStatus["Deactivated"] = "deactivated";
})(UserStatus || (UserStatus = {}));
export var EnrollmentStatus;
(function (EnrollmentStatus) {
    EnrollmentStatus["Pending"] = "pending";
    EnrollmentStatus["Active"] = "active";
    EnrollmentStatus["Completed"] = "completed";
    EnrollmentStatus["Canceled"] = "canceled";
})(EnrollmentStatus || (EnrollmentStatus = {}));
export var CompletionStatus;
(function (CompletionStatus) {
    CompletionStatus["NotStarted"] = "not_started";
    CompletionStatus["InProgress"] = "in_progress";
    CompletionStatus["Completed"] = "completed";
    CompletionStatus["Failed"] = "failed";
})(CompletionStatus || (CompletionStatus = {}));
export var AsyncTaskStatus;
(function (AsyncTaskStatus) {
    AsyncTaskStatus["Queued"] = "queued";
    AsyncTaskStatus["Running"] = "running";
    AsyncTaskStatus["Succeeded"] = "succeeded";
    AsyncTaskStatus["Failed"] = "failed";
    AsyncTaskStatus["Canceled"] = "canceled";
})(AsyncTaskStatus || (AsyncTaskStatus = {}));
export var DocumentStatus;
(function (DocumentStatus) {
    DocumentStatus["Draft"] = "draft";
    DocumentStatus["Generated"] = "generated";
    DocumentStatus["Signed"] = "signed";
    DocumentStatus["Archived"] = "archived";
})(DocumentStatus || (DocumentStatus = {}));
export var SigningStatus;
(function (SigningStatus) {
    SigningStatus["NotRequired"] = "not_required";
    SigningStatus["Pending"] = "pending";
    SigningStatus["Signed"] = "signed";
    SigningStatus["Rejected"] = "rejected";
})(SigningStatus || (SigningStatus = {}));
export var ProctoringStatus;
(function (ProctoringStatus) {
    ProctoringStatus["NotRequired"] = "not_required";
    ProctoringStatus["Scheduled"] = "scheduled";
    ProctoringStatus["InProgress"] = "in_progress";
    ProctoringStatus["Completed"] = "completed";
    ProctoringStatus["Flagged"] = "flagged";
})(ProctoringStatus || (ProctoringStatus = {}));
export var NotificationStatus;
(function (NotificationStatus) {
    NotificationStatus["Pending"] = "pending";
    NotificationStatus["Sent"] = "sent";
    NotificationStatus["Delivered"] = "delivered";
    NotificationStatus["Failed"] = "failed";
})(NotificationStatus || (NotificationStatus = {}));
export var IntegrationTaskStatus;
(function (IntegrationTaskStatus) {
    IntegrationTaskStatus["Pending"] = "pending";
    IntegrationTaskStatus["Running"] = "running";
    IntegrationTaskStatus["Succeeded"] = "succeeded";
    IntegrationTaskStatus["Failed"] = "failed";
})(IntegrationTaskStatus || (IntegrationTaskStatus = {}));
//# sourceMappingURL=index.js.map