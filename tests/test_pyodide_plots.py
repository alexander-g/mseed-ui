import os
import sys
import tempfile
import time

import numpy as np
import pytest


basedir = os.path.dirname(__file__)
srcdir  = os.path.join(basedir, '..', 'frontend', 'lib')
sys.path.append(srcdir)

import pyodide_plot




def test_plot_data():
    x  = np.random.randint(0,100, size=(200,), dtype='int32')
    i0 = 20
    i1 = 80
    start_timestamp_s = time.time()
    sample_rate = 50
    title = 'pytest'
    tempdir = tempfile.TemporaryDirectory()
    output_path = os.path.join(tempdir.name, 'plot.png')

    pyodide_plot.plot_data(x, i0, i1, start_timestamp_s, sample_rate, title, output_path)
    assert os.path.exists(output_path)



def test_spectrogram():
    x  = np.random.randint(0,100, size=(500,), dtype='int32')
    frequency = 50

    spec = pyodide_plot.create_spectrogram(x, frequency)


def test_spectrogram_short_signal():
    x  = np.random.randint(0,100, size=(8,), dtype='int32')
    frequency = 50

    spec = pyodide_plot.create_spectrogram(x, frequency)
    assert spec.data.size > 0



def test_plot_spectrogram():
    x  = np.random.randint(0,100, size=(500,), dtype='int32')
    i0 = 20
    i1 = 400
    start_timestamp_s = time.time()
    sample_rate = 50
    title = 'pytest'
    tempdir = tempfile.TemporaryDirectory()
    output_path = os.path.join(tempdir.name, 'plot.png')

    pyodide_plot.plot_spectrogram(x, i0, i1, start_timestamp_s, sample_rate, title, output_path)
    assert os.path.exists(output_path)


    # shorter
    i1 = 80
    # dont fail
    pyodide_plot.plot_spectrogram(x, i0, i1, start_timestamp_s, sample_rate, title, output_path)


def test_create_modulation_power_spectrum():
    x = np.random.randint(0, 100, size=(500,), dtype='int32')
    frequency = 50

    mps = pyodide_plot.create_modulation_power_spectrum(x, frequency)
    assert mps.data.size > 0
    assert mps.data.shape == (mps.spectral_axis.size, mps.temporal_axis.size)


def test_create_modulation_power_spectrum_invalid_input():
    x = np.random.randint(0, 100, size=(32, 8), dtype='int32')
    frequency = 50

    with pytest.raises(AssertionError):
        pyodide_plot.create_modulation_power_spectrum(x, frequency)


def test_plot_modulation_power_spectrum_short_slice():
    x = np.random.randint(0, 100, size=(250,), dtype='int32')
    i0 = 10
    i1 = 88
    start_timestamp_s = time.time()
    sample_rate = 50
    title = 'pytest'
    tempdir = tempfile.TemporaryDirectory()
    output_path = os.path.join(tempdir.name, 'plot.png')

    pyodide_plot.plot_modulation_power_spectrum(
        x,
        i0,
        i1,
        start_timestamp_s,
        sample_rate,
        title,
        output_path,
    )

    assert os.path.exists(output_path)
