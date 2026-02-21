"""Export trained PyTorch model to ONNX format for Node.js inference."""

import argparse
import torch
from model import SailingAI
from dataset import INPUT_DIM


def export(args):
    model = SailingAI()
    model.load_state_dict(torch.load(args.checkpoint, map_location="cpu", weights_only=True))
    model.eval()

    dummy_input = torch.randn(1, INPUT_DIM)
    torch.onnx.export(
        model,
        dummy_input,
        args.output,
        export_params=True,
        opset_version=17,
        do_constant_folding=True,
        input_names=["features"],
        output_names=["heading"],
        dynamic_axes={
            "features": {0: "batch_size"},
            "heading": {0: "batch_size"},
        },
    )
    print(f"ONNX model exported to: {args.output}")
    print(f"Input shape: (batch, {INPUT_DIM})")
    print("Output shape: (batch, 2)  [sin(twa), cos(twa)]")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export sailing AI to ONNX")
    parser.add_argument("--checkpoint", default="checkpoints/sailing_ai.pt", help="PyTorch checkpoint")
    parser.add_argument("--output", default="../server/models/sailing_ai.onnx", help="ONNX output path")
    args = parser.parse_args()
    export(args)
