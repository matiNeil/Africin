import type { Metadata } from "next";
import { Suspense } from "react";
import ActivateClient from "./ActivateClient";

export const metadata: Metadata = {
  title: "Activate Your TV — Africin",
  description: "Enter the code shown on your TV to sign in to the Africin app there.",
};

export default function ActivatePage() {
  return (
    <Suspense>
      <ActivateClient />
    </Suspense>
  );
}
