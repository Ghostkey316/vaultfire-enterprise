/**
 * @vaultfire/enterprise — Trust Gate Middleware
 *
 * Express/Fastify-compatible middleware that gates requests based on
 * Vaultfire on-chain trust scores.
 *
 * USAGE:
 *   import express from 'express';
 *   import { VaultfireEnterpriseClient } from './client';
 *   import { POLICIES, vaultfireTrustGate } from './middleware';
 *
 *   const client = new VaultfireEnterpriseClient();
 *   const app = express();
 *
 *   // Gate the /sensitive-api route at Gold tier or above
 *   app.use('/sensitive-api', vaultfireTrustGate(client, POLICIES.sensitive));
 */

import type { VaultfireEnterpriseClient } from './client';
import type {
  SupportedChain,
  TrustGateOptions,
  TrustPolicy,
  VaultfireRequest,
} from './types';
import { evaluatePolicy } from './policies';

// ─────────────────────────────────────────────────────────────────────────────
// Express-compatible types (no hard dependency on @types/express)
// ─────────────────────────────────────────────────────────────────────────────

interface ExpressRequest {
  headers: Record<string, string | string[] | undefined>;
  [key: string]: unknown;
}

interface ExpressResponse {
  status(code: number): ExpressResponse;
  json(body: unknown): void;
  headersSent?: boolean;
}

type NextFunction = (error?: unknown) => void;

export type RequestHandler = (
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction,
) => void | Promise<void>;

// ─────────────────────────────────────────────────────────────────────────────
// vaultfireTrustGate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Express/Fastify middleware factory.
 * Gates requests based on the agent's Vaultfire trust score.
 *
 * The agent's Ethereum address is read from the `x-agent-address` header
 * (or a custom header specified in options.addressHeader).
 *
 * @param client  An initialized VaultfireEnterpriseClient
 * @param policy  The trust policy to enforce
 * @param options Optional configuration
 *
 * @example
 * app.use('/api/sensitive', vaultfireTrustGate(client, POLICIES.sensitive));
 * app.use('/api/critical',  vaultfireTrustGate(client, POLICIES.critical, {
 *   attachReport: true,
 *   rejectionMessage: 'Insufficient on-chain trust for this operation.',
 * }));
 */
export function vaultfireTrustGate(
  client: VaultfireEnterpriseClient,
  policy: TrustPolicy,
  options: Partial<TrustGateOptions> = {},
): RequestHandler {
  const addressHeader = options.addressHeader ?? 'x-agent-address';
  const rejectionMessage =
    options.rejectionMessage ??
    `Access denied: agent does not meet the "${policy.name}" trust policy.`;
  const attachReport = options.attachReport ?? false;
  const chain = options.chain as SupportedChain | undefined;

  return async (
    req: ExpressRequest & Partial<VaultfireRequest>,
    res: ExpressResponse,
    next: NextFunction,
  ) => {
    try {
      // 1. Extract agent address from request header
      const rawHeader = req.headers[addressHeader];
      const agentAddress = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

      if (!agentAddress) {
        res.status(401).json({
          error: 'Missing agent address',
          detail: `No agent address found in header "${addressHeader}".`,
          policy: policy.name,
        });
        return;
      }

      // 2. Fetch trust report
      const trustReport = await client.verifyExternalAgent(agentAddress, { chain });

      // 3. Evaluate against policy
      const policyResult = evaluatePolicy(trustReport, policy);

      // 4. Attach report to request if requested
      if (attachReport) {
        req.vaultfireTrust = {
          address: agentAddress,
          policyResult,
          trustReport,
        };
      }

      // 5. Gate based on policy result
      if (!policyResult.passes) {
        res.status(403).json({
          error: 'Trust gate failed',
          message: rejectionMessage,
          policy: policy.name,
          streetCredScore: trustReport.streetCred.score,
          streetCredTier: trustReport.streetCred.tier,
          violations: policyResult.violations.map((v) => ({
            rule: v.rule,
            message: v.message,
          })),
        });
        return;
      }

      // 6. Policy passed — continue
      next();
    } catch (err) {
      // Don't leak internal errors to clients; pass to Express error handler
      next(err);
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fastify plugin wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps vaultfireTrustGate for use as a Fastify preHandler hook.
 *
 * @example
 * fastify.addHook('preHandler', vaultfireFastifyGate(client, POLICIES.standard));
 */
export function vaultfireFastifyGate(
  client: VaultfireEnterpriseClient,
  policy: TrustPolicy,
  options: Partial<TrustGateOptions> = {},
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const gate = vaultfireTrustGate(client, policy, options);

  return (request: FastifyRequest, reply: FastifyReply): Promise<void> =>
    new Promise((resolve, reject) => {
      const next = (err?: unknown) => {
        if (err) {
          reject(err as Error);
        } else {
          resolve();
        }
      };

      // Adapt Fastify request/reply to Express-like interface
      const req = request as unknown as ExpressRequest;
      const res: ExpressResponse = {
        status: (code: number) => {
          reply.status(code);
          return res;
        },
        json: (body: unknown) => {
          void reply.send(body);
        },
      };

      void gate(req, res, next);
    });
}

// Minimal Fastify types (no hard dependency)
interface FastifyRequest {
  headers: Record<string, string | string[] | undefined>;
  [key: string]: unknown;
}

interface FastifyReply {
  status(code: number): FastifyReply;
  send(payload: unknown): FastifyReply;
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-export policies for convenience
// ─────────────────────────────────────────────────────────────────────────────

export { POLICIES, createPolicy, evaluatePolicy } from './policies';
