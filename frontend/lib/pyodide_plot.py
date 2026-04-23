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
from scipy.signal import stft


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
) -> None:
    """Plot a time slice and optionally save it to a PNG file."""
    # NOTE: data is a memoryview when called from JS, making sure its numpy
    data = np.asarray(data, dtype=np.int32)
    start: int
    stop: int
    start, stop = _slice_bounds(i0, i1, data.size)

    start_time = dt.datetime.fromtimestamp(start_timestamp_s, tz=dt.timezone.utc)

    sliced_data: npt.NDArray[np.int32] = data[start:stop]
    time_axis: list[dt.datetime] = [
        start_time + dt.timedelta(seconds=float(idx) / sample_rate_hz)
            for idx in range(start, stop)
    ]

    fig: matplotlib.figure.Figure
    ax: matplotlib.axes.Axes
    fig, ax = plt.subplots()
    ax.plot(time_axis, sliced_data)  # type: ignore [arg-type]
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
    
    plt.close(fig)




class Spectrogram(tp.NamedTuple):
    f_axis: npt.NDArray[np.float64]
    t_axis: npt.NDArray[np.float64]
    data:   npt.NDArray[np.complex128]
    n_per_segment: int


class ModulationPowerSpectrum(tp.NamedTuple):
    carrier_axis:    npt.NDArray[np.float64]  # Hz
    modulation_axis: npt.NDArray[np.float64]  # 1/Hz
    data:            npt.NDArray[np.float64]


def create_spectrogram(
    signal:     npt.NDArray[np.int32],
    frequency:  float,
    normalized: bool = False,
    center:     bool = True,
) -> Spectrogram:
    assert signal.ndim == 1, 'Expected 1D input'

    n_samples: int = int(signal.size)

    # sensible hardcoded resolution (0.5Hz for a 100Hz input)
    frequency_resolution: float = frequency / 200
    n_per_segment: int = int(frequency / frequency_resolution)
    n_per_segment = max(1, min(n_per_segment, n_samples))
    hop_length = n_per_segment // 4
    noverlap   = n_per_segment - hop_length
    if noverlap >= n_per_segment:
        noverlap = n_per_segment - 1

    

    f_axis, t_axis, Z = stft(
        signal,
        fs = frequency,
        nperseg  = n_per_segment,
        noverlap = noverlap,
        boundary = 'zeros' if center else None,
        padded   = True if center else False,
        return_onesided = True,
        detrend  = False,
        axis     = -1,
    )

    return Spectrogram(f_axis, t_axis, Z, n_per_segment)


def create_modulation_power_spectrum(
    signal: npt.NDArray[np.int32],
    frequency: float,
) -> ModulationPowerSpectrum:
    '''Compute modulation power spectrum from a 1D signal.'''
    spec: Spectrogram = create_spectrogram(signal, frequency)
    spec_log_data: npt.NDArray[np.float64] = np.log10(np.abs(spec.data) + 1.0)

    mps_complex: npt.NDArray[np.complex128] = np.fft.fft(spec_log_data, axis=1)
    mps_data: npt.NDArray[np.float64] = np.log10(np.abs(mps_complex) ** 2 + 1.0)


    dt = spec.t_axis[1]-spec.t_axis[0]
    modulation_f_axis = np.fft.fftfreq(mps_data.shape[1], d=dt)
    positives = (modulation_f_axis > 0)


    carrier_f_axis = spec.f_axis
    modulation_f_axis = modulation_f_axis[positives]
    mps_data = mps_data[:,positives]

    return ModulationPowerSpectrum(carrier_f_axis, modulation_f_axis, mps_data)



def plot_spectrogram(
    data: npt.NDArray[np.int32],
    i0:  int,
    i1:  int,
    start_timestamp_s: float,
    sample_rate_hz:    float,
    title: str,
    output_path: tp.Optional[str],
):
    """Visualize a time slice as a spectrogram and optionally save it to a PNG file."""
    # NOTE: data is a memoryview when called from JS, making sure its numpy
    data = np.asarray(data, dtype=np.int32)
    start: int
    stop: int
    start, stop = _slice_bounds(i0, i1, data.size)

    start_time = dt.datetime.fromtimestamp(start_timestamp_s, tz=dt.timezone.utc)

    sliced_data: npt.NDArray[np.int32] = data[start:stop]


    spec = create_spectrogram(sliced_data, sample_rate_hz)
    speclogdata = np.log10( np.abs(spec.data)+1 )

    time_axis: list[dt.datetime] = [
        start_time + dt.timedelta(seconds = start/sample_rate_hz + s) for s in spec.t_axis
    ]

    fig: matplotlib.figure.Figure
    ax: matplotlib.axes.Axes
    fig, ax = plt.subplots()
    ax.pcolor(time_axis, spec.f_axis, speclogdata, vmin=0, vmax=+4) # type: ignore [arg-type]
    ax.set_xlabel('Time (UTC)')
    ax.set_ylabel('Frequency (Hz)')
    ax.set_title(f'{title} - Spectrogram')
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d %H:%M:%S'))
    
    fig.autofmt_xdate()
    plt.tight_layout()

    if output_path is not None:
        fig.savefig(output_path)
    
    plt.close(fig)


def plot_modulation_power_spectrum(
    data: npt.NDArray[np.int32],
    i0: int,
    i1: int,
    start_timestamp_s: float,
    sample_rate_hz: float,
    title: str,
    output_path: tp.Optional[str],
) -> None:
    '''Plot modulation power spectrum and optionally save it to a PNG file.'''
    _ = start_timestamp_s
    data = np.asarray(data, dtype=np.int32)
    start: int
    stop: int
    start, stop = _slice_bounds(i0, i1, data.size)

    sliced_data: npt.NDArray[np.int32] = data[start:stop]
    mps: ModulationPowerSpectrum = create_modulation_power_spectrum(
        sliced_data,
        sample_rate_hz,
    )

    fig: matplotlib.figure.Figure
    ax: matplotlib.axes.Axes
    fig, ax = plt.subplots()
    ax.pcolor(
        mps.modulation_axis,
        mps.carrier_axis,
        mps.data,
        # shading='auto',
    )
    ax.set_xlabel('Modulation Frequency (1/Hz)')
    ax.set_ylabel('Carrier Frequency (Hz)')
    ax.set_title(f'{title} - Modulation Power Spectrum')

    plt.tight_layout()

    if output_path is not None:
        fig.savefig(output_path)

    plt.close(fig)
