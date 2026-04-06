import datetime as dt
from pathlib import Path
import typing as tp

import matplotlib

matplotlib.use('AGG')

import matplotlib.dates as mdates
import matplotlib.figure
import matplotlib.pyplot as plt
import numpy as np
import numpy.typing as npt


def _slice_bounds(i0: int, i1: int, n_samples: int) -> tuple[int, int]:
    if n_samples <= 0:
        return 0, 0

    start: int = max(0, min(i0, n_samples))
    stop: int = max(start, min(i1, n_samples))
    return start, stop


def plot_data(
    data: npt.NDArray[np.int32],
    i0: int,
    i1: int,
    start_timestamp_s: float,
    sample_rate_hz: float,
    title: str,
    output_path: tp.Optional[str],
) -> matplotlib.figure.Figure:
    """Plot a time slice and optionally save it to a PNG file."""
    values: npt.NDArray[np.int32] = np.asarray(data, dtype=np.int32)
    start: int
    stop: int
    start, stop = _slice_bounds(i0, i1, values.size)

    data = np.asarray(data)

    start_time = dt.datetime.fromtimestamp(start_timestamp_s)
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=dt.timezone.utc)

    sliced_data: npt.NDArray[np.int32] = values[start:stop]
    time_axis: list[dt.datetime] = [
        start_time + dt.timedelta(seconds=float(idx) / sample_rate_hz)
            for idx in range(start, stop)
    ]

    fig: matplotlib.figure.Figure
    ax: matplotlib.axes.Axes
    fig, ax = plt.subplots()
    ax.plot(time_axis, sliced_data)
    ax.set_xlabel('Time (UTC)')
    ax.set_ylabel('Amplitude')
    ax.set_title(title)
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d %H:%M:%S'))
    
    # Ensure y-axis range is at least std(data)
    data_std: float = float(np.std(data))
    data_min: float = float(np.min(sliced_data))
    data_max: float = float(np.max(sliced_data))
    data_range: float = data_max - data_min
    min_range: float = data_std
    if data_range < min_range:
        center: float = (data_min + data_max) / 2.0
        y_min: float = center - min_range / 2.0
        y_max: float = center + min_range / 2.0
        ax.set_ylim(y_min, y_max)
    
    fig.autofmt_xdate()
    plt.tight_layout()

    if output_path is not None:
        fig.savefig(output_path)

    return fig

