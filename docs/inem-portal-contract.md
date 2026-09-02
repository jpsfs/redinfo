# INEM portalpem — observed wire contract

Reference for the INEM unit-status integration (ADO Feature #211). Everything below was
observed against the live portal on **2026-09-02**, from a Chrome netlog capture and a HAR
export. It is the single document `packages/backend/src/inem/` and `packages/inem-worker/`
code against — prefer it over guessing, and correct it here when reality disagrees.

## Rules for this file

- **Field names and value shapes only. Never live values.** No cookie values, no
  `SAMLResponse`, no credentials, no OTP codes. The shared INEM username and password reach
  the app through `INEM_USERNAME` / `INEM_PASSWORD` and are not recorded here.
- **The source captures are secret-bearing and are not in this repo.** The netlog contains the
  shared password in cleartext in a login POST body. Do not commit either capture, and do not
  attach one to a work item.

## Validity — read this before trusting anything below

| Caveat | Detail |
|---|---|
| **A platform change is coming** | INEM has announced an enhancement to the unit table (the list of resources and actions). `GET /api/unit` and the `PUT /api/unit` body are the most likely to move. Re-capture and update this file when it lands; treat the endpoint table as a snapshot, not a guarantee. |
| **`X-ENV: TESTE`** | Every `portalpem.inem.pt` response carries this header, on the normal production hostname. There is no separate test host in any capture. Why the portal reports `TESTE`, and whether a real test environment exists, is an open question for INEM. |
| **One entity, one unit** | Everything was observed with a single entity (`CVCAMPO`) owning a single unit. Multi-unit and multi-entity behaviour is inferred from shapes, not observed. |

## Hosts

| Host | Role |
|---|---|
| `portalpem.inem.pt` | Service provider. The SPA (Remix) and the whole `/api/*` surface. |
| `fac.inem.pt` | Identity provider. FortiAuthenticator, Django-backed. Login form, OTP form, SAML assertions. |

## Cookies

| Name | Domain | Attributes | Lifetime | Meaning |
|---|---|---|---|---|
| `alAuth` | `portalpem.inem.pt` | `Path=/; Secure; HttpOnly; SameSite=None`, no `Expires` | Browser-session client-side; server-side TTL not measured | The only credential `/api/*` accepts. No bearer token, no CSRF header. |
| `samlsessionid` | `fac.inem.pt` | `Path=/; Secure; HttpOnly; SameSite=None` | **`Max-Age` 28800 (8h), rolling** | The IdP session. While alive, a fresh `alAuth` costs no password and no OTP. |
| `device_id` | `fac.inem.pt` | UUID | not measured | Sent with the credential POST. Purpose unconfirmed; possibly a "remember this device" marker. Low priority — the warm path rarely touches the login form. |

### `samlsessionid` rolls, and only on IdP contact

Measured: a re-mint's `GET /saml/signin` at `11:33:20.444Z` moved the cookie's expiry to
`19:33:20.611Z` — exactly 8h later, on a session already alive for over an hour. So the window
slides; it is not an absolute cap from first login.

**The trap:** `samlsessionid` is scoped to `fac.inem.pt`, so it is sent *only* during a
`/saml/signin` re-mint. Keep-alive traffic to `portalpem.inem.pt/api/*` does not roll it.
Keeping `alAuth` healthy while never re-minting lets the IdP session lapse silently, and the
next `alAuth` expiry then escalates to a full password + OTP login. Re-mint deliberately on a
timer well inside 8h, regardless of `alAuth` validity.

## Session acquisition

Two paths. The warm one is cheap and needs no browser; the cold one is the expensive fallback.

### Warm re-mint — plain HTTP, no browser

Valid whenever `samlsessionid` is alive. Confirmed end to end.

```
GET  https://portalpem.inem.pt/saml/signin?
  → 302 Location: https://fac.inem.pt/saml-idp/portalpem/login/
                    ?SAMLRequest=…&RelayState=…&SigAlg=…&Signature=…

GET  <that IdP URL>                              (send samlsessionid)
  → 200 text/html — a SAML auto-POST form, NOT a login page
    hidden inputs: SAMLResponse, RelayState

POST https://portalpem.inem.pt/saml/acs
     Content-Type: application/x-www-form-urlencoded
     SAMLResponse=<from the form>&RelayState=<from the form>
  → 302 Location: /Dashboard     ← the response carrying the new alAuth
```

Always start at `/saml/signin`. The SP generates and signs the `AuthnRequest`, so it cannot be
constructed client-side.

Telling the two IdP responses apart: an assertion page is dominated by the `SAMLResponse` blob
(observed 12848 bytes of HTML around an 11790-byte assertion). A login page is small and has no
such field. If you get a login page, `samlsessionid` is dead — fall back to the cold path.

### Cold login — Playwright, `packages/inem-worker`

Only when `samlsessionid` is gone.

1. `GET /saml/signin` → follow to the IdP, which now serves `form#login_form`.
2. POST to the same URL: `csrfmiddlewaretoken`, `username`, `password`, `use_token_input=0`,
   `use_token_input_hidden=true`. **No captcha field is sent on a successful login** — the
   input carries `required="true"` in the markup but is not part of a normal flow. If a
   challenge ever does appear, fail closed and alert; do not attempt to solve it.
3. → OTP page. POST: `csrfmiddlewaretoken`, `username`, `token_code`.
   **The CSRF token is regenerated between steps 2 and 3.** Re-read it from the OTP page;
   reusing the credential page's token fails.
4. → SAML auto-POST to `/saml/acs` as in the warm path → `alAuth`.

### The OTP mail

| Field | Value |
|---|---|
| Mailbox | `dcampo.coordenacao@cruzvermelha.org.pt` |
| From | `INEM FortiAuthenticator <noreply_inem@inem.pt>` |
| Subject | `Token code: <6 digits>` |
| Body fallback | digits following `Aqui esta o seu codigo de autenticacao:` |
| Auth | SPF, DKIM and DMARC all pass on `inem.pt` |

Take the code from the **subject** — it is there in full, so the HTML body never needs parsing.
Match on the sender address, not the subject alone. Accept only messages that arrived after the
current login attempt began, and mark each consumed, or a stale code produces a failure that
looks like a wrong password.

## REST API

Auth is the `alAuth` cookie alone. `Content-Type: application/json`. All paths on
`portalpem.inem.pt`.

### `GET /api/Entity`

```json
["CVCAMPO"]
```

### `GET /api/INOP`

Reason code → INEM's own display label. The **code** is the contract; the label is display data.

```json
{
  "TEPH_Falta": "Sem Tripulação",
  "Acidente_Viatura": "Avaria Viatura",
  "Limpar_Repor_Material": "Limpar/Repor_Mat",
  "Alimentacao": "Alimentação",
  "Fora_de_turno": "Ocupada – ExtraSIEM"
}
```

`"00"` is **not** in this map. It is the sentinel meaning *available* on the write path.

Note `Acidente_Viatura` is labelled "Avaria Viatura" — breakdown, not accident. Translate from
the label, never from the code.

### `GET /api/unit?entity=CVCAMPO`

```json
[{
  "StationName": null,
  "Station": "CVCAMPO",
  "UnitID": "CVCAMPO1",
  "CarID": "80PS45",
  "DeviceID": null,
  "DeviceAlias": null,
  "Active": "Inoperacional",
  "INOPReason": "TEPH_Falta",
  "UnitType": "AMBRES"
}]
```

`CarID` is the licence plate — the join key to `Vehicle.licensePlate`. `Active` is a read-only
Portuguese label derived by INEM; it is **not** writable and must not be modelled as desired
state.

### `GET /api/Statistics?entity=CVCAMPO`

```json
{ "UnitByType": { "RES": 1 }, "Available": 0, "INOP": 1, "Busy": 0, "NumberOfRadios": 0 }
```

Cheap and side-effect-free — the `alAuth` keep-alive ping.

### `PUT /api/unit`

The write path. Returns `204 No Content`.

```json
{ "pending": { "CVCAMPO1": { "INOP": "TEPH_Falta" } }, "currentEntity": "CVCAMPO" }
```

- **A batch map**, keyed by `UnitID`. Several units can be pushed in one call.
- **There is no `Active` field.** Availability is expressed only as an INOP code.
- **`{"INOP": "00"}` sets a unit available.** Confirmed by `/api/Statistics` flipping
  `Available:0, INOP:1` → `Available:1, INOP:0` across two calls.

An earlier design guessed `{UnitID, Active, INOPReason}`. That was wrong.

## Failure modes

### An expired session is a `403`, not a `401` and not a redirect

```
GET /api/INOP  → 403 Forbidden
                 Content-Type: application/problem+json
```

`/api/*` does **not** redirect to `/saml/signin`. Detect session death on a `403` from any
`/api/*` call.

### A dead session presents as an empty list

Observed on INEM's own portal: with `alAuth` deleted, the SPA loaded normally and rendered an
**empty unit table** rather than an error. `GET /api/INOP` and `GET /api/Entity` both 403'd and
it never reached `/api/unit`.

redinfo must not reproduce this. Never coerce a redirected or non-JSON response into an empty
unit array, and leave reported state untouched when a fetch fails rather than clearing it —
wiping `reportedInopCode` fleet-wide shows a delegation that looks synced and is not.

## Logging

Never log a cookie value, a `SAMLResponse`, a credential, the OTP, or a `storageState`. Log
step names, status codes and unit ids. No API response may expose the shared INEM identity.

## Open questions

| Question | Status |
|---|---|
| Server-side TTL of `alAuth` | Not measured. Not blocking — the 403 handler plus warm re-mint covers expiry whenever it happens. |
| Why the portal reports `X-ENV: TESTE`, and whether a usable test environment exists | For INEM. `INEM_BASE_URL` is configurable so one can be pointed at. |
| Purpose of the `device_id` cookie | Unconfirmed, low priority. |
| Shape of the enhanced unit table | Pending the announced INEM platform update. |

## Provenance

| Date | Source | What it settled |
|---|---|---|
| 2026-09-02 | Chrome netlog (`Everything` capture mode) | Login field names, OTP length, `PUT /api/unit` batch shape, `"00"` semantics, `/api/INOP` map, cookie attributes |
| 2026-09-02 | HAR export (sanitized) | Warm re-mint chain, `403 application/problem+json`, empty-table failure mode, `samlsessionid` 8h rolling window |
| 2026-09-02 | OTP `.msg` | Mailbox, sender, subject format |
