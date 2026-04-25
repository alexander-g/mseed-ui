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
from scipy.signal import stft, resample


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
    spectral_axis: npt.NDArray[np.float64]  # 1/Hz
    temporal_axis: npt.NDArray[np.float64]  # Hz
    data:          npt.NDArray[np.float64]


def create_spectrogram(
    signal:     npt.NDArray[np.int32],
    frequency:  float,
    frequency_resolution = 0.5,
    step:       tp.Optional[int] = None,
) -> Spectrogram:
    assert signal.ndim == 1, 'Expected 1D input'

    n_samples: int     = int(signal.size)
    n_per_segment: int = int( round(frequency / frequency_resolution) )
    n_per_segment = max(1, min(n_per_segment, n_samples))
    if step is None:
        step = n_per_segment // 4
    noverlap   = n_per_segment - step
    if noverlap >= n_per_segment:
        noverlap = n_per_segment - 1
    
    f_axis, t_axis, Z = stft(
        signal,
        fs = frequency,
        nperseg  = n_per_segment,
        noverlap = noverlap,
        boundary = None,
        padded   = False,
        return_onesided = True,
        detrend  = False,
        axis     = -1,
    )
    return Spectrogram(f_axis, t_axis, Z, n_per_segment)



# def _create_modulation_power_spectrum(
#     signal:    npt.NDArray[np.int32],
#     frequency: float,
# ) -> ModulationPowerSpectrum:
#     '''Compute modulation power spectrum from a 1D signal.'''
#     spec: Spectrogram = create_spectrogram(signal, frequency)
#     spec_log_data: npt.NDArray[np.float64] = np.log10(np.abs(spec.data) + 1.0)

#     mps_complex: npt.NDArray[np.complex128] = np.fft.fft(spec_log_data, axis=1)
#     mps_data: npt.NDArray[np.float64] = np.log10(np.abs(mps_complex) ** 2 + 1.0)


#     dt = spec.t_axis[1]-spec.t_axis[0]
#     modulation_f_axis = np.fft.fftfreq(mps_data.shape[1], d=dt)
#     positives = (modulation_f_axis > 0)


#     carrier_f_axis = spec.f_axis
#     modulation_f_axis = modulation_f_axis[positives]
#     mps_data = mps_data[:,positives]

#     return ModulationPowerSpectrum(carrier_f_axis, modulation_f_axis, mps_data)


# def create_modulation_power_spectrum(
#     signal:    npt.NDArray[np.int32],
#     frequency: float,
# ) -> ModulationPowerSpectrum:
#     '''Compute modulation power spectrum from a 1D signal.'''
#     spec: Spectrogram = create_spectrogram(signal, frequency)
#     spec_log_data: npt.NDArray[np.float64] = np.log10(np.abs(spec.data) + 1.0)
#     centered_spec: npt.NDArray[np.float64] = spec_log_data - np.mean(spec_log_data)

#     mps_complex: npt.NDArray[np.complex128] = np.fft.fftshift(
#         np.fft.fft2(centered_spec)
#     )
#     mps_data: npt.NDArray[np.float64] = np.log10(np.abs(mps_complex) ** 2 + 1.0)

#     delta_frequency_hz: float = (
#         float(np.mean(np.diff(spec.f_axis)))
#         if spec.f_axis.size > 1
#         else frequency / max(1, spec.n_per_segment)
#     )
#     delta_time_s: float = (
#         float(np.mean(np.diff(spec.t_axis)))
#         if spec.t_axis.size > 1
#         else 1.0 / max(1.0, frequency)
#     )

#     spectral_axis: npt.NDArray[np.float64] = np.fft.fftshift(
#         np.fft.fftfreq(spec.f_axis.size, d=delta_frequency_hz)
#     )
#     temporal_axis: npt.NDArray[np.float64] = np.fft.fftshift(
#         np.fft.fftfreq(spec.t_axis.size, d=delta_time_s)
#     )

#     spectral_positives = spectral_axis > 0
#     temporal_positives = temporal_axis > 0
#     spectral_axis = spectral_axis[spectral_positives]
#     temporal_axis = temporal_axis[temporal_positives]
#     mps_data      = mps_data[spectral_positives,:][:,temporal_positives]

#     return ModulationPowerSpectrum(spectral_axis, temporal_axis, mps_data)




def normalize_spectrogram(
    spectrogram: npt.NDArray[np.floating], 
    db_res: float = 50.0
) -> npt.NDArray[np.floating]:
    maxdata = spectrogram.max()
    mindata = maxdata - db_res
    s_norm = np.copy(spectrogram)
    s_norm[s_norm < mindata] = mindata
    s_norm -= s_norm.mean()
    s_norm /= s_norm.std()
    return s_norm

def pad_spectrogram(
    s: npt.NDArray[np.floating], 
    n: int, 
    value: float
) -> npt.NDArray[np.floating]:
    left  = np.ones((s.shape[0], n), dtype=s.dtype) * value
    right = np.ones((s.shape[0], n), dtype=s.dtype) * value
    return np.concatenate([left, s, right], axis=1)

def gaussian_weights(
    n_points: int, 
    nstd: float = 6
) -> npt.NDArray[np.floating]:
    x = np.linspace(-nstd, nstd, n_points)
    w = np.exp( -(x**2) / 2 )
    return w / w.sum()

def compute_mps2d(
    spectrogram: npt.NDArray[np.floating],
    f_axis:      npt.NDArray[np.floating],
    t_axis:      npt.NDArray[np.floating]
) -> tuple[npt.NDArray[np.float64], npt.NDArray[np.float64], npt.NDArray[np.float64]]:
    mps2d = np.fft.fftshift(np.fft.fft2(spectrogram))
    mps_power = np.abs(mps2d) ** 2
    nf, nt = spectrogram.shape
    df = f_axis[1] - f_axis[0] if len(f_axis) > 1 else 1.0
    dt = t_axis[1] - t_axis[0] if len(t_axis) > 1 else 1.0
    spectral_mod = np.fft.fftshift(np.fft.fftfreq(nf, df))
    temporal_mod = np.fft.fftshift(np.fft.fftfreq(nt, dt))
    return spectral_mod, temporal_mod, mps_power

def resample_to_freq(signal: npt.NDArray, og_fs:float, target_fs:float):
    duration_s = len(signal) / og_fs
    target_len = int( round(duration_s * target_fs) )
    return resample(signal, target_len)

def create_modulation_power_spectrum(
    signal:    npt.NDArray[np.int32],
    frequency: float,
    normalize: bool = True
) -> ModulationPowerSpectrum:
    '''Modulation power spectrum using overlapp and add method'''
    db_res = 50.0
    step   = 1
    # clipping sample rate due to memory issues
    frequency   = min(50, frequency)
    signal_50hz = resample_to_freq(signal, frequency, 50)
    spec: Spectrogram = create_spectrogram(
        signal_50hz, 
        frequency, 
        frequency_resolution = 0.1, 
        step = step
    )

    sdata = 20 * np.log10( np.abs(spec.data) )
    if normalize:
        sdata = normalize_spectrogram(sdata, db_res)

    f_axis = spec.f_axis
    t_axis = spec.t_axis
    window = t_axis[-1] / 10.0
    
    # window length in index units
    window_len = int( np.searchsorted(t_axis, window) )
    if window_len % 2 == 0:
        window_len += 1
    nt = len(t_axis)
    if window_len > nt:
        window_len = nt if nt % 2 else nt - 1

    weights = gaussian_weights(window_len)
    pad_len = int( (window_len - 1) // 2 )
    sdata_padded = pad_spectrogram(sdata, pad_len, sdata.min())

    mps_sum: npt.NDArray[np.floating] | None = None
    n_chunks    = 0
    center_step = window_len // 3 if window_len // 3 > 0 else 1
    nt_padded   = sdata_padded.shape[1]
    for center in range(pad_len, nt_padded - pad_len, center_step):
        start = center - pad_len
        end   = center + pad_len + 1
        if end > nt_padded:
            break
        windowed = sdata_padded[:, start:end] * weights
        spectral_frequency, temporal_frequency, mps_power = \
            compute_mps2d(windowed, f_axis, t_axis[:window_len])
        
        if mps_sum is None:
            mps_sum = mps_power
        else:
            mps_sum += mps_power
        n_chunks += 1

    if n_chunks > 0:
        mps_avg: NDArray[np.floating] = mps_sum / n_chunks  # type: ignore
    else:
        mps_avg   = np.zeros_like(sdata)
        spectral_frequency = np.zeros(len(f_axis))
        temporal_frequency = np.zeros(len(t_axis))

    spectral_positives = spectral_frequency >= 0
    temporal_positives = temporal_frequency >= 0
    spectral_frequency = spectral_frequency[spectral_positives]
    temporal_frequency = temporal_frequency[temporal_positives]
    mps_avg = mps_avg[spectral_positives,:][:,temporal_positives]

    return ModulationPowerSpectrum(spectral_frequency, temporal_frequency, mps_avg)




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

    mps_log = 10.0 * np.log10(np.maximum(mps.data, 1e-12))

    fig, ax = plt.subplots()
    ax.pcolor(
        mps.temporal_axis,
        mps.spectral_axis,
        #mps.data,
        mps_log.max() - mps_log,
        cmap = 'magma',
        # shading='auto',
    )
    ax.set_xlabel('Temporal Modulation (Hz)')
    ax.set_ylabel('Spectral Modulation (1/Hz)')
    ax.set_title(f'{title} - Modulation Power Spectrum')

    plt.tight_layout()

    if output_path is not None:
        fig.savefig(output_path)

    plt.close(fig)
