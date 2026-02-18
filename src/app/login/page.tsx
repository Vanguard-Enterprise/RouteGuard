"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, LogIn, Lock, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { motion } from "motion/react";

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "You are not authorized to access this application. Contact your administrator if you believe this is a mistake.",
  invalid_state: "Login session expired. Please try again.",
  missing_params: "Login failed due to missing parameters. Please try again.",
  missing_verifier: "Login session was invalid. Please try again.",
  missing_connection: "Login session was invalid. Please try again.",
  no_email: "Your identity provider did not return an email address.",
  callback_error: "Something went wrong during login. Please try again.",
  saml_error: "SAML authentication failed. Please try again or contact your administrator.",
  no_connection: "No SSO connection found for your email domain.",
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [staffLoading, setStaffLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const isDev = process.env.NODE_ENV === "development";

  useEffect(() => {
    const errorCode = searchParams.get("error");
    if (errorCode) {
      setAuthError(ERROR_MESSAGES[errorCode] ?? "An unexpected error occurred. Please try again.");
      // Clean the URL without reloading
      window.history.replaceState({}, "", "/login");
    }
  }, [searchParams]);

  async function handleSSOLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/sso/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "SSO login failed. Please try again.");
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("No SSO redirect URL returned.");
        setLoading(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  async function handleStaffLogin() {
    setError(null);
    setStaffLoading(true);

    try {
      const res = await fetch("/api/auth/staff/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Staff login failed. Please try again.");
        setStaffLoading(false);
        return;
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("No redirect URL returned.");
        setStaffLoading(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setStaffLoading(false);
    }
  }

  async function handleDevLogin() {
    setError(null);

    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Dev login failed.");
        setLoading(false);
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  const emailDomain = email.includes("@") ? email.split("@")[1] : "";
  const showSSOHint = emailDomain.length > 3;
  const anyLoading = loading || staffLoading;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image src="/api/r2/bus-icon.png" alt="RouteGuard" width={72} height={72} className="h-18 w-auto" />
          <span className="text-2xl font-bold tracking-tight">RouteGuard</span>
          <p className="-mt-1 text-sm text-muted-foreground">
            School bus tracking and safety platform
          </p>
        </div>

        {authError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="size-4" />
            <AlertDescription>{authError}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Enter your work email to continue with SSO.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <form onSubmit={handleSSOLogin} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@yourdistrict.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  disabled={anyLoading}
                />
                {showSSOHint && (
                  <p className="text-xs text-muted-foreground">
                    You will be redirected to your organization&apos;s SSO
                    provider for <span className="font-medium">{emailDomain}</span>.
                  </p>
                )}
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" disabled={anyLoading} className="w-full">
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <LogIn className="size-4" />
                )}
                Continue with SSO
              </Button>
            </form>

            <Separator />

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                RouteGuard Staff
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={anyLoading}
                onClick={handleStaffLogin}
              >
                {staffLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Lock className="size-4" />
                )}
                Sign in with RouteGuard SSO
              </Button>
            </div>
          </CardContent>

          {isDev && (
            <CardFooter className="flex flex-col gap-4">
              <Separator />
              <div className="flex w-full flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Development only
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={anyLoading}
                  onClick={handleDevLogin}
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Sign in as test user
                </Button>
              </div>
            </CardFooter>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By signing in, you agree to our{" "}
          <a href="/terms" className="underline underline-offset-4 hover:text-foreground">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            Privacy Policy
          </a>
          .
        </p>
      </motion.div>
    </div>
  );
}
