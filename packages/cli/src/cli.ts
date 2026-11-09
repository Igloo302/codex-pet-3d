#!/usr/bin/env node
import { Command } from "commander";
import { runValidate, formatValidationResult, type ValidationResult } from "./commands/validate.js";

const program = new Command();

program
  .name("codex-pet-3d")
  .description("CLI for validating pet-3d 3D assets")
  .version("0.1.0")
  .option("--json", "Output results as JSON", false);

program
  .command("validate <targetDir>")
  .description("Validate a pet-3d asset directory")
  .option("--json", "Output results as JSON", false)
  .action(async (targetDir: string, options: { json?: boolean }) => {
    const jsonOutput = program.opts().json ?? options.json;

    try {
      const result = await runValidate(targetDir, { json: jsonOutput });

      if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatValidationResult(result, targetDir));
      }

      process.exit(result.exitCode);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (jsonOutput) {
        console.error(
          JSON.stringify(
            {
              valid: false,
              exitCode: 1,
              errors: [
                {
                  path: targetDir,
                  code: "UNEXPECTED_ERROR",
                  message: errorMessage,
                },
              ],
              warnings: [],
            },
            null,
            2
          )
        );
      } else {
        console.error(`Error: ${errorMessage}`);
      }
      process.exit(1);
    }
  });

// Handle case where no command is provided
if (process.argv.length <= 2) {
  program.help();
}

program.parse(process.argv);