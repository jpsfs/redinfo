import { X509Certificate } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import { Agent } from 'undici';

/**
 * A trust-store patch for one specific, confirmed INEM server misconfiguration.
 *
 * `portalpem.inem.pt`'s TLS handshake serves the wrong second certificate in
 * its chain: the leaf (`CN=*.inem.pt`) is signed by "Sectigo Public Server
 * Authentication CA DV R36", but the intermediate INEM's server actually
 * sends is an unrelated "GlobalSign GCC R6 AlphaSSL CA 2025" — looks like two
 * different certificates' material got mixed in their server config. No
 * strict TLS client (Node's own `fetch`/undici, `curl` without `-k`) can
 * complete a chain from that pair, and fails with
 * `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. A real browser survives this silently by
 * chasing the leaf's Authority Information Access extension and fetching the
 * *correct* intermediate itself — which is exactly why the Playwright-driven
 * cold login in `packages/inem-worker` has always worked while every plain
 * HTTPS call this module's callers make (`InemApiClient`'s `GET /api/unit`
 * etc., *and* `InemSessionService`'s SAML warm re-mint chain) has not: the
 * first pass at this fix (2026-09-10, this same day) only wired the CA into
 * `InemApiClient`, missing that the warm re-mint chain's own bare `fetch`
 * calls hit the identical broken chain on `/saml/signin` and `/saml/acs` —
 * so re-mint kept failing with a bare "fetch failed" forever, `InemApiClient`
 * always spent a stale `alAuth`, and production never actually recovered
 * despite this file existing.
 *
 * Confirmed 2026-09-10 from the production backend pod with
 * `openssl s_client -showcerts`, and the correct intermediate fetched from
 * its own AIA URL (`http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt`)
 * and independently `openssl verify`d against the system trust store.
 *
 * Every caller dispatches through `inemTrustedDispatcher` below — one
 * request-scoped CA list (alongside the platform defaults) rather than
 * widening trust for the whole process via `NODE_EXTRA_CA_CERTS` — so a
 * future, unrelated integration never silently inherits a workaround for
 * someone else's server bug.
 *
 * This is not a weakening of verification: it is INEM's own real,
 * independently-issued intermediate for their own domain, still chained and
 * fully verified — it just happens to not be the one their server sends.
 * If INEM fixes their server's certificate chain, this becomes a no-op.
 */
export const INEM_TRUSTED_INTERMEDIATE_CA_PEM = `-----BEGIN CERTIFICATE-----
MIIGTDCCBDSgAwIBAgIQOXpmzCdWNi4NqofKbqvjsTANBgkqhkiG9w0BAQwFADBf
MQswCQYDVQQGEwJHQjEYMBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQD
Ey1TZWN0aWdvIFB1YmxpYyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYw
HhcNMjEwMzIyMDAwMDAwWhcNMzYwMzIxMjM1OTU5WjBgMQswCQYDVQQGEwJHQjEY
MBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTcwNQYDVQQDEy5TZWN0aWdvIFB1Ymxp
YyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gQ0EgRFYgUjM2MIIBojANBgkqhkiG9w0B
AQEFAAOCAY8AMIIBigKCAYEAljZf2HIz7+SPUPQCQObZYcrxLTHYdf1ZtMRe7Yeq
RPSwygz16qJ9cAWtWNTcuICc++p8Dct7zNGxCpqmEtqifO7NvuB5dEVexXn9RFFH
12Hm+NtPRQgXIFjx6MSJcNWuVO3XGE57L1mHlcQYj+g4hny90aFh2SCZCDEVkAja
EMMfYPKuCjHuuF+bzHFb/9gV8P9+ekcHENF2nR1efGWSKwnfG5RawlkaQDpRtZTm
M64TIsv/r7cyFO4nSjs1jLdXYdz5q3a4L0NoabZfbdxVb+CUEHfB0bpulZQtH1Rv
38e/lIdP7OTTIlZh6OYL6NhxP8So0/sht/4J9mqIGxRFc0/pC8suja+wcIUna0HB
pXKfXTKpzgis+zmXDL06ASJf5E4A2/m+Hp6b84sfPAwQ766rI65mh50S0Di9E3Pn
2WcaJc+PILsBmYpgtmgWTR9eV9otfKRUBfzHUHcVgarub/XluEpRlTtZudU5xbFN
xx/DgMrXLUAPaI60fZ6wA+PTAgMBAAGjggGBMIIBfTAfBgNVHSMEGDAWgBRWc1hk
lfmSGrASKgRieaFAFYghSTAdBgNVHQ4EFgQUaMASFhgOr872h6YyV6NGUV3LBycw
DgYDVR0PAQH/BAQDAgGGMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0lBBYwFAYI
KwYBBQUHAwEGCCsGAQUFBwMCMBsGA1UdIAQUMBIwBgYEVR0gADAIBgZngQwBAgEw
VAYDVR0fBE0wSzBJoEegRYZDaHR0cDovL2NybC5zZWN0aWdvLmNvbS9TZWN0aWdv
UHVibGljU2VydmVyQXV0aGVudGljYXRpb25Sb290UjQ2LmNybDCBhAYIKwYBBQUH
AQEEeDB2ME8GCCsGAQUFBzAChkNodHRwOi8vY3J0LnNlY3RpZ28uY29tL1NlY3Rp
Z29QdWJsaWNTZXJ2ZXJBdXRoZW50aWNhdGlvblJvb3RSNDYucDdjMCMGCCsGAQUF
BzABhhdodHRwOi8vb2NzcC5zZWN0aWdvLmNvbTANBgkqhkiG9w0BAQwFAAOCAgEA
YtOC9Fy+TqECFw40IospI92kLGgoSZGPOSQXMBqmsGWZUQ7rux7cj1du6d9rD6C8
ze1B2eQjkrGkIL/OF1s7vSmgYVafsRoZd/IHUrkoQvX8FZwUsmPu7amgBfaY3g+d
q1x0jNGKb6I6Bzdl6LgMD9qxp+3i7GQOnd9J8LFSietY6Z4jUBzVoOoz8iAU84OF
h2HhAuiPw1ai0VnY38RTI+8kepGWVfGxfBWzwH9uIjeooIeaosVFvE8cmYUB4TSH
5dUyD0jHct2+8ceKEtIoFU/FfHq/mDaVnvcDCZXtIgitdMFQdMZaVehmObyhRdDD
4NQCs0gaI9AAgFj4L9QtkARzhQLNyRf87Kln+YU0lgCGr9HLg3rGO8q+Y4ppLsOd
unQZ6ZxPNGIfOApbPVf5hCe58EZwiWdHIMn9lPP6+F404y8NNugbQixBber+x536
WrZhFZLjEkhp7fFXf9r32rNPfb74X/U90Bdy4lzp3+X1ukh1BuMxA/EEhDoTOS3l
7ABvc7BYSQubQ2490OcdkIzUh3ZwDrakMVrbaTxUM2p24N6dB+ns2zptWCva6jzW
r8IWKIMxzxLPv5Kt3ePKcUdvkBU/smqujSczTzzSjIoR5QqQA6lN1ZRSnuHIWCvh
JEltkYnTAH41QJ6SAWO66GrrUESwN/cgZzL4JLEqz1Y=
-----END CERTIFICATE-----
`;

/** Sanity check, run at import time: fail loudly at boot rather than mint a broken agent. */
const cert = new X509Certificate(INEM_TRUSTED_INTERMEDIATE_CA_PEM);
if (cert.subject !== 'C=GB\nO=Sectigo Limited\nCN=Sectigo Public Server Authentication CA DV R36') {
  throw new Error(`inem-trusted-ca.ts: unexpected certificate subject "${cert.subject}"`);
}

/**
 * Single shared dispatcher carrying the workaround above, for every plain
 * HTTPS call this module's callers make to `portalpem.inem.pt` — that's
 * `InemApiClient`'s `/api/*` REST surface *and* `InemSessionService`'s SAML
 * warm re-mint chain (`/saml/signin`, the IdP hop, `/saml/acs`), which hits
 * the exact same broken chain. A second `Agent` per caller would still work,
 * but would needlessly split the connection pool for calls to the same host.
 */
export const inemTrustedDispatcher = new Agent({ connect: { ca: [...rootCertificates, INEM_TRUSTED_INTERMEDIATE_CA_PEM] } });
