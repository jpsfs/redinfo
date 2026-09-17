import { X509Certificate } from 'node:crypto';
import { INEM_TRUSTED_INTERMEDIATE_CA_PEM } from './inem-trusted-ca';

describe('INEM_TRUSTED_INTERMEDIATE_CA_PEM', () => {
  const cert = new X509Certificate(INEM_TRUSTED_INTERMEDIATE_CA_PEM);

  it('is the real Sectigo intermediate that signs portalpem.inem.pt\'s leaf, not the wrong one INEM\'s server serves', () => {
    expect(cert.subject).toBe('C=GB\nO=Sectigo Limited\nCN=Sectigo Public Server Authentication CA DV R36');
    expect(cert.issuer).toBe('C=GB\nO=Sectigo Limited\nCN=Sectigo Public Server Authentication Root R46');
  });

  it('has not silently changed since it was pinned (2026-09-10)', () => {
    expect(cert.fingerprint256).toBe(
      '8C:54:C3:34:B6:6B:A4:E4:26:77:2A:F4:A3:F9:13:6C:19:A1:AE:C7:29:FD:B2:8C:53:5C:07:A5:A4:EF:22:E0',
    );
  });

  it('has not expired', () => {
    expect(new Date(cert.validTo).getTime()).toBeGreaterThan(Date.now());
  });
});
