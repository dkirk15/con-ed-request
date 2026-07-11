/**
 * Generated from the API contract.
 */
import type { ConEdRequest } from "./conEdRequest";

export interface RequestListResponse {
  items: ConEdRequest[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
