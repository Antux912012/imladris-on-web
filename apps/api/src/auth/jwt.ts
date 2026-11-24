// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "imladris_session";
const TEXT_ENCODER = new TextEncoder();

export interface SessionPayload {
  sub: string;
  email: string;
  displayName: string;
}

export async function signSessionToken(
  payload: SessionPayload,
  secret: string,
  expiresIn = "7d"
): Promise<string> {
  const key = TEXT_ENCODER.encode(secret);
  return new SignJWT({
    email: payload.email,
    displayName: payload.displayName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

export async function verifySessionToken(
  token: string,
  secret: string
): Promise<SessionPayload | null> {
  try {
    const key = TEXT_ENCODER.encode(secret);
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.displayName !== "string"
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      email: payload.email,
      displayName: payload.displayName,
    };
  } catch {
    return null;
  }
}
