import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';

type ValidationDetail = {
  path: string;
  message: string;
  code: string;
};

const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      const details: ValidationDetail[] = error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code
      }));

      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details
        },
        requestId: request.id
      });
    }

    const statusCode =
      typeof (error as { statusCode?: number }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 500;

    const isServerError = statusCode >= 500;
    if (isServerError) {
      request.log.error({ err: error }, 'Unhandled request error');
    } else {
      request.log.warn({ err: error }, 'Request failed');
    }

    const defaultMessage = isServerError ? 'Internal server error' : 'Request failed';
    const errorMessage = (error as { message?: unknown }).message;
    const safeMessage =
      isServerError || typeof errorMessage !== 'string' || errorMessage.length === 0
        ? defaultMessage
        : errorMessage;

    return reply.status(statusCode).send({
      error: {
        code: (error as { code?: string }).code || (isServerError ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
        message: safeMessage
      },
      requestId: request.id
    });
  });
};

export default fp(errorHandlerPlugin, { name: 'error-handler' });
