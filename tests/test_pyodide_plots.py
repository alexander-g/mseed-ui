import os
import sys
import tempfile
import time

import numpy as np


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


