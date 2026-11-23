import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ModelDropzone } from "../src/components/ModelDropzone";

afterEach(cleanup);

describe("ModelDropzone", () => {
  it("rejects non-.glb files and invokes onError", () => {
    const onModel = vi.fn();
    const onError = vi.fn();
    render(<ModelDropzone onModel={onModel} onError={onError} />);

    const dropzone = screen.getByRole("button");
    const badFile = new File(["hello"], "cat.png", { type: "image/png" });
    fireEvent.drop(dropzone, { dataTransfer: { files: [badFile] } });

    expect(onModel).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Only .glb (glTF 2.0 binary) files are supported.");
  });

  it("reads a .glb file as Uint8Array and passes it to onModel", async () => {
    const onModel = vi.fn();
    const onError = vi.fn();
    render(<ModelDropzone onModel={onModel} onError={onError} />);

    const dropzone = screen.getByRole("button");
    const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
    const glbFile = new File([bytes], "pet.glb", { type: "model/gltf-binary" });
    fireEvent.drop(dropzone, { dataTransfer: { files: [glbFile] } });

    await vi.waitFor(() => {
      expect(onModel).toHaveBeenCalledTimes(1);
    });
    expect(onModel.mock.calls[0][1]).toBe("pet.glb");
    expect(onModel.mock.calls[0][0]).toBeInstanceOf(Uint8Array);
    expect(onError).not.toHaveBeenCalled();
  });
});
