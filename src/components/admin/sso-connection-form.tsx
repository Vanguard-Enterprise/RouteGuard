"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
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

  const [displayName, setDisplayName] = useState(connection?.displayName ?? "");
  const [domain, setDomain] = useState(connection?.domain ?? "");
  const [enabled, setEnabled] = useState(connection?.enabled ?? true);
  const [oidcIssuerUrl, setOidcIssuerUrl] = useState(connection?.oidcIssuerUrl ?? "");
  const [oidcClientId, setOidcClientId] = useState(connection?.oidcClientId ?? "");
  const [oidcClientSecret, setOidcClientSecret] = useState(connection?.oidcClientSecret ?? "");
  const [oidcScopes, setOidcScopes] = useState(connection?.oidcScopes ?? "openid email profile");

  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setLoading(true);

    try {
      const url = isEdit
        ? `/api/admin/organizations/${orgId}/sso/${connection!.id}`
        : `/api/admin/organizations/${orgId}/sso`;
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "oidc",
          displayName,
          domain,
          enabled,
          oidcIssuerUrl,
          oidcClientId,
          oidcClientSecret,
          oidcScopes,
        }),
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
        setTestResult({ success: true, message: `Connected to ${data.issuer}` });
      } else {
        setTestResult({ success: false, message: data.error || "Test failed" });
      }
    } catch {
      setTestResult({ success: false, message: "Network error during test" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit SSO Connection" : "Add SSO Connection"}
          </DialogTitle>
          <DialogDescription>
            Configure an OIDC identity provider for this organization. SAML
            support is coming in a future update.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
              <Label htmlFor="sso-client-secret">Client Secret *</Label>
              <Input
                id="sso-client-secret"
                type="password"
                value={oidcClientSecret}
                onChange={(e) => setOidcClientSecret(e.target.value)}
                placeholder="OAuth client secret"
              />
            </div>
          </div>

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
