import { getGuildConfig, setGuildConfig } from '../services/config/guildConfig.js';
import { verifyUser } from '../services/verificationService.js';
import {
    cancelRobloxAuthorization,
    completeRobloxAuthorization,
    formatRobloxNickname,
} from '../services/robloxVerificationService.js';
import { logger } from '../utils/logger.js';

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[character]);
}

function renderResultPage(title, message, success) {
    const color = success ? '#57f287' : '#ed4245';
    return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<body style="margin:0;background:#232428;color:#f2f3f5;font:16px system-ui,sans-serif">
  <main style="max-width:520px;margin:12vh auto;padding:32px;background:#2b2d31;border-radius:12px">
    <h1 style="color:${color}">${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <p>You can close this page and return to Discord.</p>
  </main>
</body>
</html>`;
}

export async function handleRobloxOAuthCallback(request, response, client) {
    const state = typeof request.query.state === 'string' ? request.query.state : null;

    if (request.query.error) {
        cancelRobloxAuthorization(state);
        response
            .status(400)
            .type('html')
            .send(renderResultPage(
                'Roblox verification cancelled',
                'Roblox authorization was not completed. Return to Discord and try again if you still want to verify.',
                false,
            ));
        return;
    }

    try {
        const authorization = await completeRobloxAuthorization({
            state,
            code: typeof request.query.code === 'string' ? request.query.code : null,
        });
        const guildConfig = await getGuildConfig(client, authorization.guildId);
        const verification = guildConfig.verification;

        if (!verification?.enabled || verification.mode !== 'roblox') {
            const error = new Error('Roblox verification is not enabled for this server.');
            error.publicMessage = error.message;
            throw error;
        }

        const linkedAccounts = verification.robloxLinks || {};
        const existingLink = Object.entries(linkedAccounts).find(
            ([discordUserId, account]) =>
                discordUserId !== authorization.discordUserId &&
                account?.robloxUserId === authorization.robloxUserId,
        );

        if (existingLink) {
            const error = new Error('That Roblox account is already linked to another member in this server.');
            error.publicMessage = error.message;
            throw error;
        }

        const result = await verifyUser(client, authorization.guildId, authorization.discordUserId, {
            source: 'roblox_oauth',
            moderatorId: null,
        });

        verification.robloxLinks = {
            ...linkedAccounts,
            [authorization.discordUserId]: {
                robloxUserId: authorization.robloxUserId,
                username: authorization.robloxUsername,
                displayName: authorization.robloxDisplayName,
                linkedAt: new Date().toISOString(),
            },
        };
        guildConfig.verification = verification;
        await setGuildConfig(client, authorization.guildId, guildConfig);

        let nicknameUpdated = true;
        try {
            const guild = client.guilds.cache.get(authorization.guildId);
            const member = await guild.members.fetch(authorization.discordUserId);
            await member.setNickname(
                formatRobloxNickname(authorization.robloxDisplayName, authorization.robloxUsername),
                'Linked Roblox account for server verification',
            );
        } catch (error) {
            nicknameUpdated = false;
            logger.warn('Roblox verification succeeded but the Discord nickname could not be updated', {
                guildId: authorization.guildId,
                discordUserId: authorization.discordUserId,
                error: error.message,
            });
        }

        logger.info('Roblox account linked for verification', {
            guildId: authorization.guildId,
            discordUserId: authorization.discordUserId,
            robloxUserId: authorization.robloxUserId,
            verificationStatus: result.status,
        });

        response
            .status(200)
            .type('html')
            .send(renderResultPage(
                'Verification complete',
                nicknameUpdated
                    ? `Your Roblox account ${authorization.robloxDisplayName} (@${authorization.robloxUsername}) is linked, your server nickname was updated, and your Discord verification is complete.`
                    : `Your Roblox account ${authorization.robloxDisplayName} (@${authorization.robloxUsername}) is linked and your Discord verification is complete, but I could not change your server nickname. Ask a server admin to give the bot Manage Nicknames permission and place its role above yours.`,
                true,
            ));
    } catch (error) {
        logger.warn('Roblox OAuth verification failed', { error: error.message });
        const publicMessage = error.publicMessage || error.userMessage;
        response
            .status(publicMessage ? 400 : 500)
            .type('html')
            .send(renderResultPage(
                'Verification could not be completed',
                publicMessage || 'The verification service encountered a problem. Return to Discord and try again.',
                false,
            ));
    }
}
