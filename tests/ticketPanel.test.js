import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    buildTicketPanelButtonRows,
    buildTicketPanelEmbed,
    formatPanelButtonCombinedValue,
    getTicketPanelButtonCustomId,
    getTicketPanelButtons,
    normalizeTicketPanelConfig,
    parsePanelButtonCombinedField,
    parsePanelButtonCombinedFields,
    resolveTicketPanelEmojiPreset,
    emojiToPresetValue,
    validatePanelImageUrl,
} from '../src/utils/ticketPanel.js';

function mockFields(values) {
    return {
        getTextInputValue: (key) => values[key] ?? '',
    };
}

describe('ticketPanel', () => {
    it('falls back to legacy ticketButtonLabel', () => {
        assert.deepEqual(getTicketPanelButtons({ ticketButtonLabel: 'Help' }), [
            { label: 'Help', emoji: '📩' },
        ]);
    });

    it('parses emoji prefix combined input', () => {
        const parsed = parsePanelButtonCombinedField('📩 Support', 0);
        assert.equal(parsed.ok, true);
        assert.equal(parsed.label, 'Support');
        assert.equal(parsed.emoji, '📩');
    });

    it('parses emoji keyword combined input', () => {
        const parsed = parsePanelButtonCombinedField('ticket General Help', 1);
        assert.equal(parsed.ok, true);
        assert.equal(parsed.label, 'General Help');
        assert.equal(parsed.emoji, '🎫');
    });

    it('defaults first button emoji when only label is provided', () => {
        const parsed = parsePanelButtonCombinedField('Support', 0);
        assert.equal(parsed.ok, true);
        assert.equal(parsed.emoji, '📩');
    });

    it('allows optional buttons without emoji', () => {
        const parsed = parsePanelButtonCombinedField('Billing', 1);
        assert.equal(parsed.ok, true);
        assert.equal(parsed.emoji, null);
    });

    it('parses all combined modal fields', () => {
        const parsed = parsePanelButtonCombinedFields(
            mockFields({
                btn_1_combined: '📩 Support',
                btn_2_combined: 'billing Payments',
                btn_3_combined: '',
            }),
        );

        assert.equal(parsed.ok, true);
        assert.deepEqual(parsed.buttons, [
            { label: 'Support', emoji: '📩' },
            { label: 'Payments', emoji: '💳' },
        ]);
    });

    it('formats combined values for modal prefill', () => {
        assert.equal(formatPanelButtonCombinedValue({ label: 'Support', emoji: '📩' }), '📩 Support');
        assert.equal(formatPanelButtonCombinedValue({ label: 'Support', emoji: null }), 'Support');
    });

    it('builds a single embed with banner image and panel message', () => {
        const embed = buildTicketPanelEmbed({
            ticketPanelMessage: 'Need help?',
            ticketPanelImage: 'https://example.com/banner.png',
        });

        assert.equal(embed.data.image.url, 'https://example.com/banner.png');
        assert.equal(embed.data.description, 'Need help?');
    });

    it('always applies emoji to the first button', () => {
        const rows = buildTicketPanelButtonRows({
            ticketPanelButtons: [{ label: 'Support' }, { label: 'Billing', emoji: '💳' }],
        });

        assert.equal(rows[0].components[0].data.emoji?.name, '📩');
        assert.equal(rows[0].components[1].data.emoji?.name, '💳');
    });

    it('resolves emoji preset values', () => {
        assert.equal(resolveTicketPanelEmojiPreset('preset:ticket', 1), '🎫');
        assert.equal(resolveTicketPanelEmojiPreset('preset:none', 0), '📩');
        assert.equal(emojiToPresetValue('💳', 1), 'preset:card');
    });

    it('normalizes legacy config into ticketPanelButtons', () => {
        const config = normalizeTicketPanelConfig({ ticketButtonLabel: 'Help Me' });
        assert.deepEqual(config.ticketPanelButtons, [{ label: 'Help Me', emoji: '📩' }]);
    });

    it('validates panel image urls', () => {
        assert.equal(validatePanelImageUrl('https://example.com/a.png').ok, true);
        assert.equal(validatePanelImageUrl('').ok, true);
    });
});
