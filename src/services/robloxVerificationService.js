import { createHash, randomBytes } from 'node:crypto';

const ROBLOX_AUTHORIZE_URL = 'https://apis.roblox.com/oauth/v1/authorize';
const ROBLOX_TOKEN_URL = 'https://apis.roblox.com/oauth/v1/token';
const ROBLOX_USERINFO_URL = 'https://apis.roblox.com/oauth/v1/userinfo';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_STATES = 10_000;
const pendingAuthorizations = new Map();

function getOAuthConfig() {
    const clientId = process.env.ROBLOX_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.ROBLOX_OAUTH_CLIENT_SECRET?.trim();
    const redirectUri = process.env.ROBLOX_OAUTH_REDIRECT_URI?.trim();

    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error(
            'Roblox account verification is not configured. Set ROBLOX_OAUTH_CLIENT_ID, ROBLOX_OAUTH_CLIENT_SECRET, and ROBLOX_OAUTH_REDIRECT_URI.',
        );
    }

    let parsedRedirectUri;
    try {
        parsedRedirectUri = new URL(redirectUri);
    } catch {
        throw new Error('ROBLOX_OAUTH_REDIRECT_URI must be a valid HTTPS URL.');
    }

    if (
        parsedRedirectUri.protocol !== 'https:' &&
        parsedRedirectUri.hostname !== 'localhost' &&
        parsedRedirectUri.hostname !== '127.0.0.1'
    ) {
        throw new Error('ROBLOX_OAUTH_REDIRECT_URI must use HTTPS.');
    }

    if (
        parsedRedirectUri.pathname !== '/oauth/roblox/callback' ||
        parsedRedirectUri.username ||
        parsedRedirectUri.password ||
        parsedRedirectUri.search ||
        parsedRedirectUri.hash
    ) {
        throw new Error(
            'ROBLOX_OAUTH_REDIRECT_URI must end in /oauth/roblox/callback and cannot contain credentials, query parameters, or a fragment.',
        );
    }

    return { clientId, clientSecret, redirectUri: parsedRedirectUri.href };
}

function base64Url(buffer) {
    return buffer.toString('base64url');
}

export function formatRobloxNickname(displayName, username) {
    const normalizedUsername = username.trim();
    const suffix = ` (@${normalizedUsername})`;
    const availableDisplayNameLength = Math.max(0, 32 - suffix.length);
    const normalizedDisplayName = Array.from(displayName.trim())
        .slice(0, availableDisplayNameLength)
        .join('')
        .trimEnd();

    return normalizedDisplayName
        ? `${normalizedDisplayName}${suffix}`
        : `@${normalizedUsername}`;
}

function prunePendingAuthorizations(now = Date.now()) {
    for (const [state, authorization] of pendingAuthorizations) {
        if (authorization.expiresAt <= now) pendingAuthorizations.delete(state);
    }

    while (pendingAuthorizations.size > MAX_PENDING_STATES) {
        const oldestState = pendingAuthorizations.keys().next().value;
        if (!oldestState) break;
        pendingAuthorizations.delete(oldestState);
    }
}

export function isRobloxOAuthConfigured() {
    try {
        getOAuthConfig();
        return true;
    } catch {
        return false;
    }
}

export function createRobloxAuthorizationUrl({ guildId, discordUserId }) {
    const oauthConfig = getOAuthConfig();
    const now = Date.now();
    prunePendingAuthorizations(now);

    const state = base64Url(randomBytes(32));
    const codeVerifier = base64Url(randomBytes(32));
    const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest());

    pendingAuthorizations.set(state, {
        guildId,
        discordUserId,
        codeVerifier,
        expiresAt: now + OAUTH_STATE_TTL_MS,
    });

    const authorizeUrl = new URL(ROBLOX_AUTHORIZE_URL);
    authorizeUrl.search = new URLSearchParams({
        client_id: oauthConfig.clientId,
        redirect_uri: oauthConfig.redirectUri,
        response_type: 'code',
        scope: 'openid profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
    }).toString();

    return authorizeUrl.toString();
}

export function cancelRobloxAuthorization(state) {
    if (typeof state === 'string') pendingAuthorizations.delete(state);
}

function createPublicError(message) {
    const error = new Error(message);
    error.publicMessage = message;
    return error;
}

export async function completeRobloxAuthorization({ state, code }) {
    if (typeof state !== 'string' || typeof code !== 'string' || !state || !code) {
        throw createPublicError('The Roblox authorization response was incomplete. Please try again.');
    }

    prunePendingAuthorizations();
    const authorization = pendingAuthorizations.get(state);
    pendingAuthorizations.delete(state);

    if (!authorization || authorization.expiresAt <= Date.now()) {
        throw createPublicError('This Roblox verification link expired or was already used. Please start again.');
    }

    const { clientId, clientSecret, redirectUri } = getOAuthConfig();
    const tokenResponse = await fetch(ROBLOX_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            code_verifier: authorization.codeVerifier,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
        }),
        signal: AbortSignal.timeout(10_000),
    });

    if (!tokenResponse.ok) {
        throw createPublicError(`Roblox token exchange failed (HTTP ${tokenResponse.status}).`);
    }

    const tokenData = await tokenResponse.json();
    if (typeof tokenData.access_token !== 'string' || !tokenData.access_token) {
        throw createPublicError('Roblox did not return an access token. Please try again.');
    }

    const profileResponse = await fetch(ROBLOX_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        signal: AbortSignal.timeout(10_000),
    });

    if (!profileResponse.ok) {
        throw createPublicError(`Roblox profile lookup failed (HTTP ${profileResponse.status}).`);
    }

    const profile = await profileResponse.json();
    if (typeof profile.sub !== 'string' || !/^\d+$/.test(profile.sub)) {
        throw createPublicError('Roblox returned an invalid account identity. Please try again.');
    }
    const robloxUsername = profile.preferred_username || profile.nickname || profile.sub;
    if (
        typeof robloxUsername !== 'string' ||
        !/^[A-Za-z0-9_]{3,20}$/.test(robloxUsername)
    ) {
        throw createPublicError('Roblox returned an invalid username. Please try again.');
    }
    const robloxDisplayName =
        typeof profile.name === 'string' && profile.name.trim()
            ? profile.name.trim()
            : robloxUsername;

    return {
        ...authorization,
        robloxUserId: profile.sub,
        robloxUsername,
        robloxDisplayName,
    };
}
