"""Behavioral cloning model for sailing AI."""

import torch
import torch.nn as nn
from dataset import INPUT_DIM, OUTPUT_DIM


class SailingAI(nn.Module):
    def __init__(self, input_dim: int = INPUT_DIM, output_dim: int = OUTPUT_DIM):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 128),
            nn.ReLU(),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, output_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)
