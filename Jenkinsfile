
/* Only keep the 10 most recent builds. */
properties([[$class: 'BuildDiscarderProperty',
            strategy: [$class: 'LogRotator', numToKeepStr: '10']]])

node {

    try {

        stage 'checkout'

            // get latest version from VCS
            checkout scm

            env.VERSION = "${env.BRANCH_NAME}_${env.BUILD_NUMBER}"

        stage 'Build docker image'

            sh "docker build --tag icracked/acc-tools"

        stage 'Push docker image'

            //Push to dockerhub
            sh "docker push icracked/acc-tools:${env.VERSION}"

            //Run - set env variables
            sh "docker run --env-file=./.env -p 1234:8000 -d acc-tools"

        stage 'Deploy'

            // Environment variable set by jenkins based on context of VCS
            if( env.BRANCH_NAME == 'devel' ){

                sh "ssh staging_apifrontend \"cd `` && VERSION=${env.VERSION} ./rundocker.sh acc-tools\""

            } else if( env.BRANCH_NAME == 'master' ){

                sh "ssh prod_api_frontend0 \"cd `` && VERSION=${env.VERSION} ./rundocker.sh acc-tools\""
                sh "ssh prod_api_frontend1 \"cd `` && VERSION=${env.VERSION} ./rundocker.sh acc-tools\""
                sh "ssh prod_api_frontend2 \"cd `` && VERSION=${env.VERSION} ./rundocker.sh acc-tools\""
            }

    } catch (e) {

    throw e

    }
}