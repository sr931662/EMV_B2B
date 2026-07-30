terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Remote state is strongly recommended before more than one person runs this. Local state means
  # whoever holds terraform.tfstate owns the infrastructure, and losing the file orphans every
  # resource. Create the bucket + lock table once, then uncomment.
  #
  # backend "s3" {
  #   bucket         = "travnexa-tfstate"
  #   key            = "prod/terraform.tfstate"
  #   region         = "ap-south-1"
  #   dynamodb_table = "travnexa-tfstate-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "travnexa-global"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# CloudFront only accepts ACM certificates from us-east-1, regardless of where everything else
# lives. This aliased provider exists solely to issue/look up that certificate.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "travnexa-global"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
