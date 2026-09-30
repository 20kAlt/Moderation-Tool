import { handlePollVote } from '../../../services/pollService.js';

export default {
    name: 'poll_vote',
    execute: handlePollVote,
};