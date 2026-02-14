"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle, XCircle, Download, Copy, Check } from "lucide-react";
import type { SsoConnection } from "@/db/schema";

interface SsoConnectionFormProps {
  orgId: string;
  connection?: SsoConnection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function SsoConnectionForm({
  orgId,
  connection,
  open,
  onOpenChange,
  onSaved,
}: SsoConnectionFormProps) {
  const isEdit = !!connection;

  const [type, setType] = useState<"oidc" | "saml">(connection?.type ?? "oidc");
  const [displayName, setDisplayName] = useState(connection?.displayName ?? "");
  const [domain, setDomain] = useState(connection?.domain ?? "");
  const [enabled, setEnabled] = useState(connection?.enabled ?? true);

  // OIDC fields
  const [oidcIssuerUrl, setOidcIssuerUrl] = useState(connection?.oidcIssuerUrl ?? "");
  const [oidcClientId, setOidcClientId] = useState(connection?.oidcClientId ?? "");
  const [oidcClientSecret, setOidcClientSecret] = useState(connection?.oidcClientSecret ?? "");
  const [oidcScopes, setOidcScopes] = useState(connection?.oidcScopes ?? "openid email profile");

  // SAML fields
  const [samlMetadataUrl, setSamlMetadataUrl] = useState(connection?.samlMetadataUrl ?? "");
  const [samlEntityId, setSamlEntityId] = useState(connection?.samlEntityId ?? "");
  const [samlSsoUrl, setSamlSsoUrl] = useState(connection?.samlSsoUrl ?? "");
  const [samlCertificate, setSamlCertificate] = useState(connection?.samlCertificate ?? "");

  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingMetadata, setFetchingMetadata] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function copyToClipboard(value: string, key: string) {
    navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const callbackUrls = type === "oidc"
    ? [{ label: "Redirect URI", value: `${origin}/api/auth/sso/callback` }]
    : [
        { label: "ACS URL", value: `${origin}/api/auth/sso/saml/acs` },
        { label: "SP Entity ID / Metadata", value: `${origin}/api/auth/sso/saml/metadata` },
      ];

  async function handleSave() {
    setError(null);
    setLoading(true);

    try {
      const url = isEdit
        ? `/api/admin/organizations/${orgId}/sso/${connection!.id}`
        : `/api/admin/organizations/${orgId}/sso`;
      const method = isEdit ? "PUT" : "POST";

      const payload: Record<string, unknown> = {
        type,
        displayName,
        domain,
        enabled,
      };

      if (type === "oidc") {
        payload.oidcIssuerUrl = oidcIssuerUrl;
        payload.oidcClientId = oidcClientId;
        payload.oidcClientSecret = oidcClientSecret;
        payload.oidcScopes = oidcScopes;
      } else {
        payload.samlMetadataUrl = samlMetadataUrl;
        payload.samlEntityId = samlEntityId;
        payload.samlSsoUrl = samlSsoUrl;
        payload.samlCertificate = samlCertificate;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save SSO connection.");
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTest() {
    if (!isEdit) return;
    setTestResult(null);

    try {
      const res = await fetch(
        `/api/admin/organizations/${orgId}/sso/${connection!.id}/test`,
        { method: "POST" },
      );
      const data = await res.json();

      if (res.ok) {
        const detail = type === "oidc"
          ? `Connected to ${data.issuer}`
          : data.entityId
            ? `Verified IdP: ${data.entityId}`
            : `SSO URL reachable`;
        setTestResult({ success: true, message: detail });
      } else {
        setTestResult({ success: false, message: data.error || "Test failed" });
      }
    } catch {
      setTestResult({ success: false, message: "Network error during test" });
    }
  }

  async function handleFetchMetadata() {
    if (!samlMetadataUrl) return;
    setFetchingMetadata(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/admin/organizations/${orgId}/sso/fetch-metadata`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metadataUrl: samlMetadataUrl }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch metadata.");
      }

      if (data.entityId) setSamlEntityId(data.entityId);
      if (data.ssoUrl) setSamlSsoUrl(data.ssoUrl);
      if (data.certificate) setSamlCertificate(data.certificate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch metadata.");
    } finally {
      setFetchingMetadata(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit SSO Connection" : "Add SSO Connection"}
          </DialogTitle>
          <DialogDescription>
            Configure an identity provider for this organization.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Protocol</Label>
            <Select value={type} onValueChange={(v) => setType(v as "oidc" | "saml")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oidc">OIDC (OpenID Connect)</SelectItem>
                <SelectItem value="saml">SAML 2.0</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border bg-muted/50 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Enter these in your identity provider:
            </p>
            {callbackUrls.map(({ label, value }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0 w-36">
                  {label}
                </span>
                <code className="text-xs bg-background rounded px-1.5 py-0.5 border truncate flex-1">
                  {value}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-7 p-0 shrink-0"
                  onClick={() => copyToClipboard(value, label)}
                >
                  {copied === label ? (
                    <Check className="size-3.5 text-green-600" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sso-name">Display Name *</Label>
              <Input
                id="sso-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Google Workspace"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sso-domain">Domain *</Label>
              <Input
                id="sso-domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="e.g. lincoln.edu"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <Label>Enabled</Label>
          </div>

          {/* ── OIDC Fields ── */}
          {type === "oidc" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="sso-issuer">OIDC Issuer URL *</Label>
                <Input
                  id="sso-issuer"
                  value={oidcIssuerUrl}
                  onChange={(e) => setOidcIssuerUrl(e.target.value)}
                  placeholder="https://accounts.google.com"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sso-client-id">Client ID *</Label>
                  <Input
                    id="sso-client-id"
                    value={oidcClientId}
                    onChange={(e) => setOidcClientId(e.target.value)}
                    placeholder="OAuth client ID"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sso-client-secret">Client Secret</Label>
                  <Input
                    id="sso-client-secret"
                    type="password"
                    value={oidcClientSecret}
                    onChange={(e) => setOidcClientSecret(e.target.value)}
                    placeholder="OAuth client secret"
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                PKCE (S256) is used automatically. Client secret is optional for
                public clients.
              </p>

              <div className="space-y-2">
                <Label htmlFor="sso-scopes">Scopes</Label>
                <Input
                  id="sso-scopes"
                  value={oidcScopes}
                  onChange={(e) => setOidcScopes(e.target.value)}
                  placeholder="openid email profile"
                />
                <p className="text-xs text-muted-foreground">
                  Space-separated OIDC scopes. Defaults to &quot;openid email profile&quot;.
                </p>
              </div>
            </>
          )}

          {/* ── SAML Fields ── */}
          {type === "saml" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="saml-metadata-url">Metadata URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="saml-metadata-url"
                    value={samlMetadataUrl}
                    onChange={(e) => setSamlMetadataUrl(e.target.value)}
                    placeholder="https://idp.example.com/metadata"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!samlMetadataUrl || fetchingMetadata}
                    onClick={handleFetchMetadata}
                  >
                    {fetchingMetadata ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    Fetch
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste the IdP metadata URL to auto-fill the fields below.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="saml-entity-id">IdP Entity ID</Label>
                <Input
                  id="saml-entity-id"
                  value={samlEntityId}
                  onChange={(e) => setSamlEntityId(e.target.value)}
                  placeholder="https://idp.example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="saml-sso-url">SSO URL *</Label>
                <Input
                  id="saml-sso-url"
                  value={samlSsoUrl}
                  onChange={(e) => setSamlSsoUrl(e.target.value)}
                  placeholder="https://idp.example.com/sso/saml"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="saml-certificate">Certificate *</Label>
                <Textarea
                  id="saml-certificate"
                  value={samlCertificate}
                  onChange={(e) => setSamlCertificate(e.target.value)}
                  placeholder="Paste the IdP X.509 signing certificate (base64)"
                  rows={4}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  The IdP&apos;s X.509 signing certificate. PEM format or raw base64.
                </p>
              </div>
            </>
          )}

          {testResult && (
            <div
              className={`flex items-center gap-2 rounded-md p-3 text-sm ${
                testResult.success
                  ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                  : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
              }`}
            >
              {testResult.success ? (
                <CheckCircle className="size-4" />
              ) : (
                <XCircle className="size-4" />
              )}
              {testResult.message}
            </div>
          )}

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          {isEdit && (
            <Button type="button" variant="outline" onClick={handleTest}>
              Test Connection
            </Button>
          )}
          <Button type="button" disabled={loading} onClick={handleSave}>
            {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isEdit ? "Save Changes" : "Add Connection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
