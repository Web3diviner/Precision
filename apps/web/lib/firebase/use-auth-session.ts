"use client";

import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
import { firebaseAuth } from "./client";

export function useAuthSessionVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => firebaseAuth ? onAuthStateChanged(firebaseAuth, () => setVersion(previous => previous + 1)) : undefined, []);
  return version;
}
