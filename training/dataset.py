"""PyTorch dataset for sailing training data exported as CSV."""

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset

FEATURE_COLS = [
    "twaSin", "twaCos", "windSpeed", "boatSpeed",
    "bearingToMarkSin", "bearingToMarkCos", "distToMark",
    "legUpwind", "legDownwind", "tack", "raceTime",
    "stallTimer", "tackTimer",
    "near1Bearing", "near1Dist",
    "near2Bearing", "near2Dist",
    "near3Bearing", "near3Dist",
]

TARGET_COLS = ["target_twa_sin", "target_twa_cos"]

INPUT_DIM = len(FEATURE_COLS)
OUTPUT_DIM = len(TARGET_COLS)


class SailingDataset(Dataset):
    def __init__(self, csv_path: str):
        df = pd.read_csv(csv_path)
        self.features = torch.tensor(df[FEATURE_COLS].values, dtype=torch.float32)
        self.targets = torch.tensor(df[TARGET_COLS].values, dtype=torch.float32)

    def __len__(self):
        return len(self.features)

    def __getitem__(self, idx):
        return self.features[idx], self.targets[idx]


def load_and_split(csv_path: str, val_fraction: float = 0.2, seed: int = 42):
    """Load CSV and split into train/val datasets by shuffled index."""
    ds = SailingDataset(csv_path)
    n = len(ds)
    rng = np.random.default_rng(seed)
    indices = rng.permutation(n)
    split = int(n * (1 - val_fraction))
    train_idx = indices[:split]
    val_idx = indices[split:]

    train_ds = torch.utils.data.Subset(ds, train_idx.tolist())
    val_ds = torch.utils.data.Subset(ds, val_idx.tolist())
    return train_ds, val_ds
