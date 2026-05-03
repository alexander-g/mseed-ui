#include <cstdio>
#include <cstring>
#include <iostream>
#include <format>
#include <print>

#include <libmseed.h>




#define OK                         0;
#define MSTL3_INIT_FAILED       -201;
#define MSTL3_READBUFFER_FAILED -202;
#define NO_TRACES_IN_FILE       -203;
#define TOO_MANY_TRACES_IN_FILE -204;
#define INVALID_NUMBER_OF_SEGMENTS  -205
#define SID2NSLC_FAILED             -206;
#define SAMPLETYPE_NOT_IMPLEMENTED  -207;


#define float64_t double



extern "C" {

int32_t read_mseed(
    const char* buffer, 
    uint64_t bufferlength,
    
    // outputs
    uint64_t*  starttime,
    uint64_t*  endtime,
    uint64_t*  nsamples,
    float64_t* samplerate,
    // at least 32 bytes!
    char*      code,

    // optional outputs
    // buffer for waveform samples, can be null
    float*     samplebuffer,
    // size of samplebuffer in number of samples (i.e. x4 bytes)
    int32_t    samplebuffersize
) {
    const bool metadata_only = (samplebuffer == nullptr || samplebuffersize == 0);

    uint32_t flags = 0;
    flags |= MSF_VALIDATECRC;
    if(!metadata_only)
        flags |= MSF_UNPACKDATA;
    //flags |= MSF_RECORDLIST;

    MS3TraceList *mstl = NULL;
    mstl = mstl3_init(NULL);
    if(!mstl)
        return MSTL3_INIT_FAILED;
    
    const int64_t records = mstl3_readbuffer (
        &mstl, 
        buffer, 
        bufferlength,
        /*splitversion = */ 0, 
        flags, 
        /*tolerance = */ NULL, 
        /*verbose   = */ false
    );
    if(records < 0) 
        return MSTL3_READBUFFER_FAILED;

    if(mstl->numtraceids == 0)
        return NO_TRACES_IN_FILE;

    // NOTE: for now, if there are multiple traces, using the largest only
    const MS3TraceID* trace = nullptr;
    int64_t largest_sample_count = -1;
    for(int32_t trace_index = 0; trace_index < mstl->numtraceids; trace_index++) {
        const MS3TraceID* current = mstl->traces.next[trace_index];
        if(current == nullptr || current->first == nullptr)
            continue;

        const int64_t sample_count = current->first->samplecnt;
        if(sample_count > largest_sample_count) {
            trace = current;
            largest_sample_count = sample_count;
        }
    }

    if(trace == nullptr)
        // should not happen
        return NO_TRACES_IN_FILE;

    const MS3TraceSeg* segment = nullptr;
    largest_sample_count = -1;
    for(const MS3TraceSeg* current = trace->first; current != nullptr;
        current = current->next) {
        if(current->samplecnt > largest_sample_count) {
            segment = current;
            largest_sample_count = current->samplecnt;
        }
    }

    if(segment == nullptr)
        return INVALID_NUMBER_OF_SEGMENTS;

    *starttime  = trace->earliest;
    *endtime    = trace->latest;
    *nsamples   = segment->samplecnt;
    *samplerate = segment->samprate;

    char network[8], station[8], location[8], channel[8];
    const int rc = ms_sid2nslc_n(
        trace->sid, 
        network, 
        sizeof(network), 
        station, 
        sizeof(station), 
        location, 
        sizeof(location), 
        channel, 
        sizeof(channel)
    );
    if(rc < 0)
        return SID2NSLC_FAILED;

        
    const std::string codestring = 
        std::format("{}.{}.{}.{}", network, station, location, channel);
    std::memcpy(code, codestring.data(), codestring.size());


    if(!metadata_only) {
        int64_t n_samples = samplebuffersize;
        if(n_samples > segment->samplecnt)
            n_samples = segment->samplecnt;

        if(segment->sampletype == 'i') {
            const int32_t* src = static_cast<const int32_t*>(segment->datasamples);
            for(int64_t i = 0; i < n_samples; i++)
                samplebuffer[i] = static_cast<float>(src[i]);
        } else if(segment->sampletype == 'f') {
            const float* src = static_cast<const float*>(segment->datasamples);
            for(int64_t i = 0; i < n_samples; i++)
                samplebuffer[i] = src[i];
        } else if(segment->sampletype == 'd') {
            const double* src = static_cast<const double*>(segment->datasamples);
            for(int64_t i = 0; i < n_samples; i++)
                samplebuffer[i] = static_cast<float>(src[i]);
        } else {
            return SAMPLETYPE_NOT_IMPLEMENTED;
        }
    }

    return OK;
}

} // extern "C"
