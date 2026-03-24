/**
 * Holded API client for the Invoicing and Accounting APIs.
 *
 * Rate limit: 60 requests / minute.
 * Retries with exponential backoff on transient errors (429, 5xx).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HoldedInvoice {
  id: string;
  contactId: string | null;
  contactName: string | null;
  docNumber: string;
  date: number; // Unix timestamp (seconds)
  dueDate: number | null;
  total: number;
  subtotal: number;
  tax: number;
  currency: string;
  currencyChange: number;
  desc: string | null;
  status: number;
  paid: number;
  items: HoldedInvoiceItem[];
  customFields?: Record<string, unknown>;
  tags?: string[];
  language?: string;
  notes?: string;
}

export interface HoldedInvoiceItem {
  name: string;
  desc: string | null;
  units: number;
  subtotal: number;
  tax: number;
  total: number;
  sku?: string;
  accountNumber?: string;
}

export interface HoldedContact {
  id: string;
  name: string;
  code: string | null;
  vatnumber: string | null;
  email: string | null;
  phone: string | null;
  iban: string | null;
  type: string; // "client" | "supplier" | "clientsupplier" | "other"
  tradeName?: string;
  billAddress?: HoldedAddress;
  customFields?: Record<string, unknown>;
}

export interface HoldedAddress {
  address: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
}

export interface HoldedPayment {
  id: string;
  amount: number;
  date: number; // Unix timestamp
  desc: string | null;
  paymentMethod?: string;
}

export interface HoldedAccount {
  id: string;
  accountNum: string;
  name: string;
  balance: number;
  children?: HoldedAccount[];
}

export interface HoldedPdfResponse {
  data: string; // base64-encoded PDF
  name: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;
const RATE_LIMIT_DELAY_MS = 60_000; // back off a full window on 429

export class HoldedClient {
  private readonly apiKey: string;
  private readonly invoicingBaseUrl = "https://api.holded.com/api/invoicing/v1";
  private readonly accountingBaseUrl = "https://api.holded.com/api/accounting/v1";

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("HoldedClient: apiKey is required");
    this.apiKey = apiKey;
  }

  // -----------------------------------------------------------------------
  // Public methods
  // -----------------------------------------------------------------------

  async getInvoices(page = 1, updatedAfter?: Date): Promise<HoldedInvoice[]> {
    const params = new URLSearchParams({ page: String(page) });
    if (updatedAfter) {
      params.set("updatedAfter", String(Math.floor(updatedAfter.getTime() / 1000)));
    }
    return this.get<HoldedInvoice[]>(`${this.invoicingBaseUrl}/documents/invoice?${params}`);
  }

  async getPurchases(page = 1, updatedAfter?: Date): Promise<HoldedInvoice[]> {
    const params = new URLSearchParams({ page: String(page) });
    if (updatedAfter) {
      params.set("updatedAfter", String(Math.floor(updatedAfter.getTime() / 1000)));
    }
    return this.get<HoldedInvoice[]>(`${this.invoicingBaseUrl}/documents/purchase?${params}`);
  }

  async getContacts(page = 1): Promise<HoldedContact[]> {
    const params = new URLSearchParams({ page: String(page) });
    return this.get<HoldedContact[]>(`${this.invoicingBaseUrl}/contacts?${params}`);
  }

  async getPayments(invoiceId: string): Promise<HoldedPayment[]> {
    return this.get<HoldedPayment[]>(`${this.invoicingBaseUrl}/documents/${invoiceId}/payments`);
  }

  async getAccounts(): Promise<HoldedAccount[]> {
    return this.get<HoldedAccount[]>(`${this.accountingBaseUrl}/accounts`);
  }

  async getInvoicePdf(invoiceId: string): Promise<HoldedPdfResponse> {
    return this.get<HoldedPdfResponse>(
      `${this.invoicingBaseUrl}/documents/invoice/${invoiceId}/pdf`
    );
  }

  // -----------------------------------------------------------------------
  // Pagination helper – fetches all pages sequentially
  // -----------------------------------------------------------------------

  async getAllInvoices(updatedAfter?: Date): Promise<HoldedInvoice[]> {
    return this.paginate((page) => this.getInvoices(page, updatedAfter));
  }

  async getAllPurchases(updatedAfter?: Date): Promise<HoldedInvoice[]> {
    return this.paginate((page) => this.getPurchases(page, updatedAfter));
  }

  async getAllContacts(): Promise<HoldedContact[]> {
    return this.paginate((page) => this.getContacts(page));
  }

  // -----------------------------------------------------------------------
  // Internal HTTP helper with retry + backoff
  // -----------------------------------------------------------------------

  private async get<T>(url: string): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            key: this.apiKey,
            Accept: "application/json",
          },
        });

        if (response.status === 429) {
          // Rate limited – wait and retry
          const retryAfter =
            parseInt(response.headers.get("Retry-After") ?? "", 10) * 1000 || RATE_LIMIT_DELAY_MS;
          console.warn(
            `[HoldedClient] 429 rate limited, waiting ${retryAfter}ms (attempt ${attempt + 1}/${MAX_RETRIES + 1})`
          );
          await sleep(retryAfter);
          continue;
        }

        if (response.status >= 500) {
          const body = await response.text();
          throw new Error(`Holded server error ${response.status}: ${body.slice(0, 200)}`);
        }

        if (!response.ok) {
          const body = await response.text();
          throw new HoldedApiError(
            `Holded API error ${response.status}: ${body.slice(0, 500)}`,
            response.status
          );
        }

        return (await response.json()) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry on non-transient client errors (4xx except 429)
        if (err instanceof HoldedApiError && err.status < 500) {
          throw err;
        }

        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(
            `[HoldedClient] Request failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms: ${lastError.message}`
          );
          await sleep(delay);
        }
      }
    }

    throw lastError ?? new Error("HoldedClient: request failed after retries");
  }

  private async paginate<T>(fetcher: (page: number) => Promise<T[]>): Promise<T[]> {
    const all: T[] = [];
    let page = 1;

    while (true) {
      const batch = await fetcher(page);
      if (!batch || batch.length === 0) break;
      all.push(...batch);
      page++;
    }

    return all;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export class HoldedApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "HoldedApiError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
