"""Train the sailing AI behavioral cloning model."""

import argparse
import os
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from dataset import load_and_split
from model import SailingAI


def train(args):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    train_ds, val_ds = load_and_split(args.data, val_fraction=0.2, seed=42)
    print(f"Training samples: {len(train_ds)}, Validation samples: {len(val_ds)}")

    if len(train_ds) < 100:
        print("Warning: very small dataset, model quality will be limited.")

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, drop_last=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False)

    model = SailingAI().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    loss_fn = nn.MSELoss()

    best_val_loss = float("inf")
    patience_counter = 0

    for epoch in range(1, args.epochs + 1):
        model.train()
        train_loss = 0.0
        train_batches = 0
        for features, targets in train_loader:
            features, targets = features.to(device), targets.to(device)
            pred = model(features)
            loss = loss_fn(pred, targets)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            train_loss += loss.item()
            train_batches += 1

        scheduler.step()

        model.eval()
        val_loss = 0.0
        val_batches = 0
        with torch.no_grad():
            for features, targets in val_loader:
                features, targets = features.to(device), targets.to(device)
                pred = model(features)
                loss = loss_fn(pred, targets)
                val_loss += loss.item()
                val_batches += 1

        avg_train = train_loss / max(train_batches, 1)
        avg_val = val_loss / max(val_batches, 1)

        print(f"Epoch {epoch:3d}/{args.epochs} | Train loss: {avg_train:.6f} | Val loss: {avg_val:.6f} | LR: {scheduler.get_last_lr()[0]:.2e}")

        if avg_val < best_val_loss:
            best_val_loss = avg_val
            patience_counter = 0
            os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
            torch.save(model.state_dict(), args.output)
            print(f"  -> Saved best model (val_loss={best_val_loss:.6f})")
        else:
            patience_counter += 1
            if patience_counter >= args.patience:
                print(f"Early stopping after {epoch} epochs (patience={args.patience})")
                break

    print(f"\nTraining complete. Best validation loss: {best_val_loss:.6f}")
    print(f"Model saved to: {args.output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train sailing AI model")
    parser.add_argument("--data", default="data/training_data.csv", help="Path to training CSV")
    parser.add_argument("--output", default="checkpoints/sailing_ai.pt", help="Output model path")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--patience", type=int, default=10)
    args = parser.parse_args()
    train(args)
