import { Events } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";
import { reconcileTicketPanels, reconcileVerificationPanels, reconcileReactionRolePanelHealth } from "../services/panelHealthService.js";
import { reconcileLevelRoles } from "../services/levelRoleSyncService.js";

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      // Define custom statuses (0-5) for rotation
      const customStatuses = [
        { name: "TSB, Dont quit the raid untill the last blood is DROPPED.", type: 0 }, // 0: Playing
        { name: "AGX growing stronger and bigger", type: 1 }, // 1: Streaming
        { name: "AGX Raiding music", type: 2 }, // 2: Listening
        { name: "AGX Wiping clans", type: 3 }, // 3: Watching
        { name: ":3", state: ":3", type: 4 }, // 4: Custom
        { name: "The road to top 1 raid clan", type: 5 }, // 5: Competing
      ];

      let statusIndex = 0;

      // Set initial presence
      client.user.setPresence({
        activities: [customStatuses[statusIndex]],
        status: "online",
      });

      // Rotate status every minute (60000 ms)
      setInterval(() => {
        statusIndex = (statusIndex + 1) % customStatuses.length;
        client.user.setPresence({
          activities: [customStatuses[statusIndex]],
          status: "online",
        });
        startupLog(`Status updated to: ${customStatuses[statusIndex].name}`);
      }, 60000);

      startupLog(`Ready! Logged in as ${client.user.tag}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
      startupLog(`Loaded ${client.commands.size} commands`);

      const reconciliationSummary = await reconcileReactionRoleMessages(client);
      startupLog(
        `Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`
      );

      const ticketPanelSummary = await reconcileTicketPanels(client);
      startupLog(
        `Ticket panel health: scanned ${ticketPanelSummary.scannedGuilds} guilds, healthy ${ticketPanelSummary.healthyPanels}, deleted ${ticketPanelSummary.deletedPanels}, missing channel ${ticketPanelSummary.missingChannels}, recovered ${ticketPanelSummary.recoveredIds}, errors ${ticketPanelSummary.errors}`
      );

      const verificationPanelSummary = await reconcileVerificationPanels(client);
      startupLog(
        `Verification panel health: scanned ${verificationPanelSummary.scannedGuilds} guilds, healthy ${verificationPanelSummary.healthyPanels}, deleted ${verificationPanelSummary.deletedPanels}, missing channel ${verificationPanelSummary.missingChannels}, recovered ${verificationPanelSummary.recoveredIds}, errors ${verificationPanelSummary.errors}`
      );

      const reactionRolePanelSummary = await reconcileReactionRolePanelHealth(client);
      startupLog(
        `Reaction role panel health: scanned ${reactionRolePanelSummary.scannedPanels} panels, healthy ${reactionRolePanelSummary.healthyPanels}, deleted ${reactionRolePanelSummary.deletedPanels}, missing channel ${reactionRolePanelSummary.missingChannels}, recovered ${reactionRolePanelSummary.recoveredIds}, errors ${reactionRolePanelSummary.errors}`
      );

      const levelRoleSummary = await reconcileLevelRoles(client);
      startupLog(
        `Level role sync: scanned ${levelRoleSummary.scannedGuilds} guilds, pruned ${levelRoleSummary.prunedRewardEntries} stale rewards, re-awarded ${levelRoleSummary.rolesReAwarded} roles, errors ${levelRoleSummary.errors}`
      );
    } catch (error) {
      logger.error("Error in ready event:", error);
    }
  },
};
