export var EsignApplicationStatus;
(function (EsignApplicationStatus) {
    EsignApplicationStatus["Draft"] = "draft";
    EsignApplicationStatus["Submitted"] = "submitted";
    EsignApplicationStatus["UnderReview"] = "under_review";
    EsignApplicationStatus["Approved"] = "approved";
    EsignApplicationStatus["Rejected"] = "rejected";
    EsignApplicationStatus["Expired"] = "expired";
    EsignApplicationStatus["Reused"] = "reused";
})(EsignApplicationStatus || (EsignApplicationStatus = {}));
export var EsignApplicationFileStatus;
(function (EsignApplicationFileStatus) {
    EsignApplicationFileStatus["Uploaded"] = "uploaded";
    EsignApplicationFileStatus["Verified"] = "verified";
    EsignApplicationFileStatus["Rejected"] = "rejected";
})(EsignApplicationFileStatus || (EsignApplicationFileStatus = {}));
export var SigningProcessStatus;
(function (SigningProcessStatus) {
    SigningProcessStatus["Draft"] = "draft";
    SigningProcessStatus["Prepared"] = "prepared";
    SigningProcessStatus["AwaitingParticipants"] = "awaiting_participants";
    SigningProcessStatus["InSigning"] = "in_signing";
    SigningProcessStatus["Signed"] = "signed";
    SigningProcessStatus["Failed"] = "failed";
    SigningProcessStatus["Cancelled"] = "cancelled";
})(SigningProcessStatus || (SigningProcessStatus = {}));
export var SigningParticipantStatus;
(function (SigningParticipantStatus) {
    SigningParticipantStatus["Pending"] = "pending";
    SigningParticipantStatus["Invited"] = "invited";
    SigningParticipantStatus["Viewed"] = "viewed";
    SigningParticipantStatus["Signed"] = "signed";
    SigningParticipantStatus["Rejected"] = "rejected";
    SigningParticipantStatus["Skipped"] = "skipped";
    SigningParticipantStatus["Expired"] = "expired";
})(SigningParticipantStatus || (SigningParticipantStatus = {}));
//# sourceMappingURL=index.js.map