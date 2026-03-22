/**
 * GoCardless (Nordigen) Bank Account Data API client.
 *
 * Handles OAuth2 token management with automatic caching and refresh.
 * Base URL: https://bankaccountdata.gocardless.com
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoCardlessTokenResponse {
  access: string;
  access_expires: number; // seconds until expiry
  refresh: string;
  refresh_expires: number;
}

export interface GoCardlessTransaction {
  transactionId: string;
  bookingDate: string; // ISO date
  valueDate: string; // ISO date
  transactionAmount: {
    amount: string; // string decimal, e.g. "-123.45"
    currency: string;
  };
  creditorName?: string;
  creditorAccount?: { iban?: string };
  debtorName?: string;
  debtorAccount?: { iban?: string };
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  bankTransactionCode?: string;
  internalTransactionId?: string;
  additionalInformation?: string;
}

export interface GoCardlessTransactionsResponse {
  transactions: {
    booked: GoCardlessTransaction[];
    pending: GoCardlessTransaction[];
  };
}

export interface GoCardlessBalance {
  balanceType: string;
  balanceAmount: {
    amount: string;
    currency: string;
  };
  referenceDate?: string;
}

export interface GoCardlessBalancesResponse {
  balances: GoCardlessBalance[];
}

export interface GoCardlessAccountDetails {
  account: {
    resourceId: string;
    iban?: string;
    currency?: string;
    ownerName?: string;
    name?: string;
    product?: string;
    status?: string;
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const BASE_URL = "https://bankaccountdata.gocardless.com";
const TOKEN_SAFETY_MARGIN_S = 300; // refresh 5 minutes before expiry

export class GoCardlessClient {
  private readonly secretId: string;
  private readonly secretKey: string;

  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0; // epoch ms

  constructor(secretId: string, secretKey: string) {
    if (!secretId || !secretKey) {
      throw new Error("GoCardlessClient: secretId and secretKey are required");
    }
    this.secretId = secretId;
    this.secretKey = secretKey;
  }

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------

  async authenticate(): Promise<void> {
    const response = await fetch(`${BASE_URL}/api/v2/token/new/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret_id: this.secretId,
        secret_key: this.secretKey,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new GoCardlessApiError(
        `GoCardless authentication failed (${response.status}): ${body.slice(0, 500)}`,
        response.status,
      );
    }

    const data = (await response.json()) as GoCardlessTokenResponse;
    this.accessToken = data.access;
    this.tokenExpiresAt =
      Date.now() + (data.access_expires - TOKEN_SAFETY_MARGIN_S) * 1000;

    console.log("[GoCardlessClient] Authenticated successfully");
  }

  // -----------------------------------------------------------------------
  // Public methods
  // -----------------------------------------------------------------------

  async getTransactions(
    accountId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<GoCardlessTransactionsResponse> {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);

    const qs = params.toString() ? `?${params}` : "";
    return this.request<GoCardlessTransactionsResponse>(
      `/api/v2/accounts/${accountId}/transactions/${qs}`,
    );
  }

  async getBalances(accountId: string): Promise<GoCardlessBalancesResponse> {
    return this.request<GoCardlessBalancesResponse>(
      `/api/v2/accounts/${accountId}/balances/`,
    );
  }

  async getAccountDetails(
    accountId: string,
  ): Promise<GoCardlessAccountDetails> {
    return this.request<GoCardlessAccountDetails>(
      `/api/v2/accounts/${accountId}/details/`,
    );
  }

  // -----------------------------------------------------------------------
  // Internal request helper
  // -----------------------------------------------------------------------

  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      await this.authenticate();
    }
  }

  private async request<T>(path: string): Promise<T> {
    await this.ensureAuthenticated();

    const response = await fetch(`${BASE_URL}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
      },
    });

    if (response.status === 401) {
      // Token may have been invalidated server-side — reauthenticate once
      console.warn("[GoCardlessClient] 401 received, re-authenticating...");
      await this.authenticate();

      const retry = await fetch(`${BASE_URL}${path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
        },
      });

      if (!retry.ok) {
        const body = await retry.text();
        throw new GoCardlessApiError(
          `GoCardless API error ${retry.status}: ${body.slice(0, 500)}`,
          retry.status,
        );
      }

      return (await retry.json()) as T;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new GoCardlessApiError(
        `GoCardless API error ${response.status}: ${body.slice(0, 500)}`,
        response.status,
      );
    }

    return (await response.json()) as T;
  }
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class GoCardlessApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GoCardlessApiError";
  }
}
