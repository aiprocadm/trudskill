export interface WebhookContractSkeleton {
  event: string;
  payloadSchemaRef: string;
  signatureHeader: string;
}
