import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
} from "discord.js";

const approvedEmoji = "✅";
const deniedEmoji = "❌";
const statusByEmoji = new Map([
  [approvedEmoji, "approved"],
  [deniedEmoji, "denied"],
]);

function requiredEnvironmentVariable(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

const botToken = requiredEnvironmentVariable("DISCORD_BOT_TOKEN");
const channelId = requiredEnvironmentVariable("DISCORD_CHANNEL_ID");
const reviewerRoleId = process.env.DISCORD_REVIEWER_ROLE_ID?.trim();
const supabase = createSupabaseClient(
  requiredEnvironmentVariable("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnvironmentVariable("SUPABASE_SECRET_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

async function removeReaction(reaction, userId) {
  try {
    await reaction.users.remove(userId);
  } catch (error) {
    console.warn("Could not remove a Discord reaction", error);
  }
}

async function isReviewer(message, userId) {
  if (!message.guild) return false;
  const member = await message.guild.members.fetch(userId);
  return member.permissions.has(PermissionFlagsBits.ManageMessages)
    || Boolean(reviewerRoleId && member.roles.cache.has(reviewerRoleId));
}

async function showDecision(message, status, reviewerName) {
  const currentEmbed = message.embeds[0]?.toJSON();
  if (!currentEmbed) return;

  const fields = (currentEmbed.fields ?? []).filter((field) => field.name !== "Decision");
  fields.push({
    name: "Decision",
    value: `${status === "approved" ? approvedEmoji : deniedEmoji} ${status.toUpperCase()} by ${reviewerName}`,
  });
  await message.edit({
    allowedMentions: { parse: [] },
    embeds: [{
      ...currentEmbed,
      color: status === "approved" ? 0x2eaf62 : 0xd64545,
      fields,
    }],
  });
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Discord reimbursement bot signed in as ${readyClient.user.tag}.`);
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot || reaction.message.channelId !== channelId) return;

  const status = statusByEmoji.get(reaction.emoji.name);
  if (!status) return;

  try {
    if (reaction.partial) await reaction.fetch();
    const message = reaction.message.partial
      ? await reaction.message.fetch()
      : reaction.message;

    if (!(await isReviewer(message, user.id))) {
      await removeReaction(reaction, user.id);
      console.warn(`Ignored unauthorized reimbursement decision from Discord user ${user.id}.`);
      return;
    }

    const { data: reimbursement, error: lookupError } = await supabase
      .from("reimbursements")
      .select("id, status")
      .eq("discord_message_id", message.id)
      .eq("discord_channel_id", channelId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!reimbursement) return;
    if (reimbursement.status === "pending") {
      await removeReaction(reaction, user.id);
      console.warn(`Submission ${reimbursement.id} is still processing; decision ignored.`);
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .from("reimbursements")
      .update({
        status,
        discord_decided_at: new Date().toISOString(),
        discord_reviewer_id: user.id,
      })
      .eq("id", reimbursement.id)
      .neq("status", "pending")
      .select("id")
      .maybeSingle();
    if (updateError?.code === "23514" && updateError.message === "Reopen the completed category before approving this reimbursement") {
      await removeReaction(reaction, user.id);
      console.warn("Reopen the completed category in Finance before approving this reimbursement.");
      return;
    }
    if (updateError) throw updateError;
    if (!updated) return;

    const oppositeEmoji = status === "approved" ? deniedEmoji : approvedEmoji;
    const oppositeReaction = message.reactions.resolve(oppositeEmoji);
    if (oppositeReaction) await removeReaction(oppositeReaction, user.id);
    await showDecision(message, status, user.globalName ?? user.username);
    console.log(`Submission ${reimbursement.id} marked ${status} by Discord user ${user.id}.`);
  } catch (error) {
    console.error("Failed to apply Discord reimbursement decision", error);
  }
});

client.on(Events.Error, (error) => {
  console.error("Discord client error", error);
});

await client.login(botToken);
