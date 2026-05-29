// Extract a user-facing message from a thrown error. The backend wraps
// failures in `{ success: false, error: { code, message } }` (see Rust
// shared-errors AppError::into_response), but historically some endpoints
// just returned `{ message }`, so try both shapes before falling back to
// the Error.message or a caller-provided default.
//
// Usage:
//   } catch (e) {
//     setError(extractApiError(e, "Failed to save"));
//   }
export function extractApiError(
  e: unknown,
  fallback = "Something went wrong",
): string {
  const withResp = e as {
    response?: {
      data?: {
        error?: { message?: string };
        message?: string;
      };
    };
    message?: string;
  };
  return (
    withResp?.response?.data?.error?.message ??
    withResp?.response?.data?.message ??
    withResp?.message ??
    fallback
  );
}
