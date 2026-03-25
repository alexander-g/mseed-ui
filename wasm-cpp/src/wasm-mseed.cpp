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
    int32_t*   samplebuffer,
    // size of samplebuffer in number of samples (i.e. x0.25 bytes)
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
    if(mstl->numtraceids > 1)
        // only one supported for now
        return TOO_MANY_TRACES_IN_FILE;
    

    const MS3TraceID* trace = mstl->traces.next[0];
    if(trace == nullptr)
        // should not happen
        return NO_TRACES_IN_FILE;

    if(trace->numsegments != 1)
        return INVALID_NUMBER_OF_SEGMENTS;


    *starttime  = trace->earliest;
    *endtime    = trace->latest;
    *nsamples   = trace->first->samplecnt;
    *samplerate = trace->first->samprate;

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
        if(trace->first->sampletype != 'i')
            return SAMPLETYPE_NOT_IMPLEMENTED;

        std::memcpy(
            samplebuffer, 
            trace->first->datasamples, 
            samplebuffersize * sizeof(*samplebuffer)
        );
    }

    return OK;
}

} // extern "C"



#ifndef __EMSCRIPTEN__

int main() {

    //test("./9Y.A02..DH2.D.2022.077");


    FILE* f = fopen("./9Y.A02..DH2.D.2022.077", "rb");
    if(f == NULL) {
        std::println("Could not open file");
        exit(1);
    }
    printf("%p\n", f);
    fseek(f, 0, SEEK_END);
    const int flength = ftell(f);
    fseek(f, 0, SEEK_SET);
    // std::println("{}", flength);



    char* buffer = (char*)malloc(flength);
    fread(buffer, flength, 1, f);
    fclose(f);

    uint64_t t0, t1;
    uint64_t nsamples;
    float64_t fs;
    char code[32] = {0};
    const int rc0 = read_mseed(buffer, flength, &t0, &t1, &nsamples, &fs, code, nullptr, 0);
    std::println(">> {} {} / {} / {} / {}", t0, t1, nsamples, fs, code);

    int32_t* samplebuffer = (int32_t*) std::malloc(nsamples * sizeof(int32_t));
    const int rc1 = read_mseed(buffer, flength, &t0, &t1, &nsamples, &fs, code, samplebuffer, nsamples);
    std::println(">> {}", rc1);
    
    for(int i = 0; i < 10; i++) 
        std::println("      {}", samplebuffer[i]);

    // std::println("Bye.");
}

#endif
