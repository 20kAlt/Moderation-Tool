import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const dadJokes = [
  'I used to hate facial hair, but then it grew on me.',
  'I told my dog a joke about bones, and now he won’t stop laughing — he’s a real howl.',
  'I’m reading a book on anti-gravity. It’s impossible to put down.',
  'The shovel was a groundbreaking invention.',
  'I was going to tell a time-travel joke, but you didn’t like it.',
  'My plants are doing great — they really know how to grow on me.',
  'I wanted to become a baker, but I couldn’t make enough dough.',
  'I told my computer I needed a break, and now it won’t stop sending me to sleep mode.',
  'The calendar broke because it had too many dates.',
  'I asked the librarian if the library had books on paranoia. She whispered, “They’re right behind you.”',
];

const punJokes = [
  'I used to be a baker, but I couldn’t make enough dough to rise to the occasion.',
  'I tried to catch fog yesterday, but I mist.',
  'The math book looked sad because it had too many problems.',
  'I’m friends with all the planets — we have good orbiting.',
  'The scarecrow won an award because he was outstanding in his field.',
  'I’m on a seafood diet. I see food and I eat it.',
  'The bicycle fell over because it was two-tired.',
  'I used to be a banker, but I lost interest.',
  'The tomato turned red because it saw the salad dressing.',
  'I used to be a candle-maker, but I burned out.',
];

const sillyJokes = [
  'Why did the banana go to the doctor? It wasn’t peeling well.',
  'I tried to make a belt out of watches. It was a waist of time.',
  'Why did the cookie go to the doctor? Because it felt crummy.',
  'I bought some shoes from a drug dealer. I don’t know what he laced them with.',
  'The moon is pretty good at parties — it always brings the light.',
  'I told my fridge a joke and it said, “That’s cold.”',
  'My ghost friend is awful at hide and seek. He always gives himself away.',
  'The toaster got a promotion because it was on a roll.',
  'My pencil told me to stay sharp. I said I was trying.',
  'The robot told a joke at the party, but it had no circuit-breaker.',
];

const jokePools = {
  random: [...dadJokes, ...punJokes, ...sillyJokes],
  dad: dadJokes,
  pun: punJokes,
  silly: sillyJokes,
};

const labels = {
  random: 'Random',
  dad: 'Dad Joke',
  pun: 'Pun',
  silly: 'Silly',
};

export default {
  data: new SlashCommandBuilder()
    .setName('joke')
    .setDescription('Tell a random dad joke, pun, or silly joke.')
    .addStringOption((option) =>
      option
        .setName('category')
        .setDescription('Choose the style of joke you want.')
        .addChoices(
          { name: 'Random', value: 'random' },
          { name: 'Dad joke', value: 'dad' },
          { name: 'Pun', value: 'pun' },
          { name: 'Silly', value: 'silly' },
        ),
    ),
  category: 'Fun',

  async execute(interaction) {
    await InteractionHelper.safeDefer(interaction);

    const category = interaction.options.getString('category') || 'random';
    const pool = jokePools[category] || jokePools.random;
    const joke = pool[Math.floor(Math.random() * pool.length)];

    const embed = createEmbed({
      title: `😂 ${labels[category] || 'Joke'} Time`,
      description: joke,
      color: 'primary',
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.debug(`Joke command used by user ${interaction.user.id} in guild ${interaction.guildId} with category ${category}`);
  },
};
