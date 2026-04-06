import numpy as np
import matplotlib.pylab as plt
import matplotlib

matplotlib.use('AGG')

x = np.frombuffer(open('/data_i32.bin', 'rb').read(), dtype='int32')
fig = plt.figure()
plt.plot(x)
plt.savefig('/plt.png')
plt.close(fig)
