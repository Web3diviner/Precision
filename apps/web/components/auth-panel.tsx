"use client";

import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { firebaseAuth, firebaseConfigured } from "../lib/firebase/client";

export function AuthPanel() {
  const [user, setUser] = useState<User | null>(null); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => firebaseAuth ? onAuthStateChanged(firebaseAuth, setUser) : undefined, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!firebaseAuth) return setMessage("Configure Firebase environment variables before signing in."); setPending(true); setMessage(""); try { await signInWithEmailAndPassword(firebaseAuth, email, password); setPassword(""); } catch { setMessage("Sign-in failed. Check the email, password, and Firebase Authentication configuration."); } finally { setPending(false); } }
  async function logout() { if (!firebaseAuth) return; setPending(true); setMessage(""); try { await signOut(firebaseAuth); } catch { setMessage("Sign-out failed. Check your connection and try again."); } finally { setPending(false); } }
  if (user) return <section className="panel auth-panel"><p className="eyebrow">SIGNED IN</p><strong>{user.email ?? "Authenticated user"}</strong><button type="button" onClick={() => void logout()} disabled={pending}>{pending ? "Signing out…" : "Sign out"}</button>{message ? <p role="status">{message}</p> : null}</section>;
  return <section className="panel auth-panel"><p className="eyebrow">SECURE ACCESS</p><h2>Sign in to operate</h2><form onSubmit={submit}><label>Email<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label><button type="submit" disabled={pending || !firebaseConfigured}>{pending ? "Signing in…" : "Sign in"}</button></form><p role="status">{message || (firebaseConfigured ? "Your role determines whether you can request irrigation or fertigation." : "Firebase is not configured for this deployment.")}</p></section>;
}
