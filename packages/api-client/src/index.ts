// Typed client for the Arc API. Request and response types come from
// src/schema.d.ts, which is generated from the backend's OpenAPI spec:
//   npm run api:generate
export {
  ApiError,
  createApiClient,
  type ApiClient,
  type ApiClientOptions,
  type LoginResult,
  type Schemas,
  type SessionEndReason,
  type Tokens,
  type TokenStore,
  type User,
} from './client';
