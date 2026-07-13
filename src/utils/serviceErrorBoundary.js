// serviceErrorBoundary.js

<<<<<<< HEAD
import { createError, ErrorTypes, TitanBotError } from './errorHandler.js';
=======
import { createError, ErrorTypes, TitanBotError, categorizeError } from './errorHandler.js';
>>>>>>> 771ebe2 (Reorganize project structure, wire bot config, and fix dependency vulnerabilities)
import { resolveErrorCode, getErrorMetadata } from './errorRegistry.js';

function normalizeBoundaryContext(context = {}) {
  if (!context || typeof context !== 'object') {
    return {};
  }

  return context;
}

<<<<<<< HEAD
function inferErrorType(error, fallbackType = ErrorTypes.UNKNOWN) {
  const message = error?.message?.toLowerCase?.() || '';
  const code = error?.code;

  if (typeof code === 'string') {
    if (code.includes('PERMISSION') || code.includes('FORBIDDEN')) {
      return ErrorTypes.PERMISSION;
    }

    if (code.includes('VALIDATION') || code.includes('INVALID')) {
      return ErrorTypes.VALIDATION;
    }

    if (code.includes('DB') || code.includes('SQL') || code.includes('POSTGRES')) {
      return ErrorTypes.DATABASE;
    }
  }

  if (message.includes('permission') || message.includes('forbidden')) {
    return ErrorTypes.PERMISSION;
  }

  if (message.includes('database') || message.includes('sql') || message.includes('connection') || message.includes('timeout')) {
    return ErrorTypes.DATABASE;
  }

  if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
    return ErrorTypes.VALIDATION;
  }

  return fallbackType;
}

=======
>>>>>>> 771ebe2 (Reorganize project structure, wire bot config, and fix dependency vulnerabilities)
export function ensureTypedServiceError(error, options = {}) {
  if (error instanceof TitanBotError) {
    return error;
  }

  const context = normalizeBoundaryContext(options.context);
  const fallbackType = options.type || ErrorTypes.UNKNOWN;
<<<<<<< HEAD
  const type = inferErrorType(error, fallbackType);
=======
  const categorized = categorizeError(error);
  const type = categorized === ErrorTypes.UNKNOWN ? fallbackType : categorized;
>>>>>>> 771ebe2 (Reorganize project structure, wire bot config, and fix dependency vulnerabilities)
  const service = options.service || 'unknown_service';
  const operation = options.operation || 'unknown_operation';
  const errorCode = resolveErrorCode({
    error,
    errorType: type,
    context: {
      errorCode: options.errorCode || `${service}.${operation}.failed`
    }
  });
  const errorMetadata = getErrorMetadata(errorCode);
  const message = options.message || `${service}.${operation} failed`;
  const userMessage = options.userMessage || 'Something went wrong while processing your request.';

  return createError(message, type, userMessage, {
    ...context,
    service,
    operation,
    errorCode,
    remediationHint: errorMetadata.remediation,
    severity: errorMetadata.severity,
    retryable: errorMetadata.retryable,
    originalErrorMessage: error?.message || String(error),
    originalErrorName: error?.name || 'Error',
    expected: false
  });
}

export function wrapServiceBoundary(fn, options = {}) {
  return function wrappedServiceBoundary(...args) {
    try {
      const result = fn.apply(this, args);

      if (result && typeof result.then === 'function') {
        return result.catch((error) => {
          throw ensureTypedServiceError(error, typeof options === 'function' ? options(...args) : options);
        });
      }

      return result;
    } catch (error) {
      throw ensureTypedServiceError(error, typeof options === 'function' ? options(...args) : options);
    }
  };
}

export function wrapServiceClassMethods(ServiceClass, optionsFactory) {
  const methodNames = Object.getOwnPropertyNames(ServiceClass)
    .filter((name) => name !== 'length' && name !== 'name' && name !== 'prototype')
    .filter((name) => typeof ServiceClass[name] === 'function');

  for (const methodName of methodNames) {
    ServiceClass[methodName] = wrapServiceBoundary(
      ServiceClass[methodName],
      (...args) => {
        const baseOptions = typeof optionsFactory === 'function'
          ? optionsFactory(methodName, ...args)
          : {};

        return {
          service: ServiceClass.name || 'ServiceClass',
          operation: methodName,
          ...baseOptions
        };
      }
    );
  }

  return ServiceClass;
<<<<<<< HEAD
}
=======
}
>>>>>>> 771ebe2 (Reorganize project structure, wire bot config, and fix dependency vulnerabilities)
