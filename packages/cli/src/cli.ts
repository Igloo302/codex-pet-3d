#!/usr/bin/env node
import { Command } from "commander";
import { runValidate, formatValidationResult, type ValidationResult } from "./commands/validate.js";
import { runBake2D } from "./commands/bake-2d.js";

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
              exitCode: 2,
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
      process.exit(2);
    }
  });

program
  .command("bake-2d <targetDir>")
  .description("Bake a pet-3d asset into a Codex Pet v2 2D spritesheet")
  .requiredOption(
    "--out <outDir>",
    "Output directory for spritesheet.webp and pet.json"
  )
  .action(async (targetDir: string, options: { out: string }) => {
    try {
      const result = await runBake2D(targetDir, { out: options.out });
      if (result.success) {
        console.log(`Baked 2D spritesheet to ${options.out}`);
      } else {
        console.error(`Bake failed (exit ${result.exitCode}):`);
        for (const error of result.errors ?? []) {
          console.error(`  [${error.code}] ${error.path}: ${error.message}`);
        }
      }
      process.exit(result.exitCode);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
      process.exit(1);
    }
  });

// Handle case where no command is provided
if (process.argv.length <= 2) {
  program.help();
}

program.parse(process.argv);